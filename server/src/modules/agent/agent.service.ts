import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { createAgent } from 'langchain';
import { HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { query, queryOne, query as q } from '../../common/db';
import { InventoryService } from '../inventory/inventory.service';
import { InboundService } from '../inbound/inbound.service';
import { OutboundService } from '../outbound/outbound.service';
import { buildTools } from './tools';
import { AGENT_CONFIG, AgentConfig, loadAgentConfig } from './agent.config';

const MAIN_PROMPT = `你是「仓储多Agent」的调度主管。你统管 4 位专家子 Agent，把它们当作工具调用：
- inventory_expert：实时库存、库存汇总、库存流水、仓库库位结构
- order_expert：入库/出库/移库/调整/盘点/冻结六类单据查询，并可代建入库/出库单草稿
- warning_expert：低库存、超储、临期预警与补货建议
- stats_expert：出入库趋势、库存结构、单据状态分布
工作规则：
1. 先理解用户意图，简单问题只派 1 位专家，复合问题依次派多位；不要重复调用同一工具。
2. 最终答复使用 Markdown 表格/列表，数字必须来自专家返回的真实数据，严禁编造。
3. 你不能直接修改库存；涉及建单只能由 order_expert 生成草稿，仍需人工审核。`;

const EXPERT_DEFS = [
  {
    name: 'inventory_expert', label: '库存查询专家', color: 'primary',
    prompt: `你是库存查询专家。可用工具：query_realtime_inventory（warehouseId 可选，keyword 商品名/编码）、query_inventory_summary、query_inventory_log、query_warehouse_location。
用户提到仓库名时按名称推断：中央仓=1，华东仓=2。回答要给出：在库量、冻结量、可用量（可用=在库-冻结），并用表格列出明细。`,
    tools: ['query_realtime_inventory', 'query_inventory_summary', 'query_inventory_log', 'query_warehouse_location'] as const,
  },
  {
    name: 'order_expert', label: '单据管理专家', color: 'success',
    prompt: `你是单据管理专家。查询工具：query_inbound_orders、query_outbound_orders、query_move_orders、query_adjust_orders、query_check_orders、query_freeze_orders；辅助：search_goods、search_partner、query_warehouse_location、query_realtime_inventory。
写工具：create_inbound_draft、create_outbound_draft —— 只能创建 status=0 的草稿单，单号系统自动生成；创建出库草稿前必须逐行核对可用库存，不足则整单拒绝并说明原因。你永不直接修改库存表。`,
    tools: ['query_inbound_orders', 'query_outbound_orders', 'query_move_orders', 'query_adjust_orders', 'query_check_orders', 'query_freeze_orders', 'search_goods', 'search_partner', 'query_warehouse_location', 'query_realtime_inventory', 'create_inbound_draft', 'create_outbound_draft'] as const,
  },
  {
    name: 'warning_expert', label: '预警分析专家', color: 'warning',
    prompt: `你是预警分析专家。工具：query_low_stock（低于安全库存）、query_overstock（超储）、query_expiring（临期，参数 days）、search_partner（查供应商）。
补货建议：缺口 = 安全库存 - 可用量；建议补货量取 min(最大库存 - 可用量, 缺口*2) 且不小于缺口；结合供应商给出建议。等级：可用量 ≤ 安全库存 50% 为严重。`,
    tools: ['query_low_stock', 'query_overstock', 'query_expiring', 'search_partner'] as const,
  },
  {
    name: 'stats_expert', label: '统计分析专家', color: 'info',
    prompt: `你是统计分析专家。工具：query_stats_trend（type=inbound/outbound，days 天数）、query_stats_structure。回答给出趋势、环比、占比，并给出简短结论。`,
    tools: ['query_stats_trend', 'query_stats_structure'] as const,
  },
];

interface StepEmitter { (s: { agent: string; agentLabel: string; kind: 'think' | 'tool' | 'result' | 'error' | 'done'; detail: string; ms?: number }): void | Promise<void> }

/** 每轮对话开始时从数据库读取一次运行时配置，缺省项回退到 .env 与代码内置默认值 */
interface RuntimeConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  temperature: number;
  enabled: boolean;
  prompts: Record<string, string>;
  tools: Set<string> | null;
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly cfg: AgentConfig;
  private readonly registry: ReturnType<typeof buildTools>;
  private runtime: RuntimeConfig | null = null;

  constructor(
    cfgService: ConfigService,
    @Optional() @Inject(AGENT_CONFIG) injected?: AgentConfig,
    private readonly inventory?: InventoryService,
    private readonly inbound?: InboundService,
    private readonly outbound?: OutboundService,
  ) {
    this.cfg = injected || loadAgentConfig(cfgService);
    this.registry = buildTools({ inventory: this.inventory! });
  }

  /**
   * 读取本轮运行时配置。四类配置都是「可选覆盖」：
   * 表不存在、没有启用记录或查询失败时，一律沿用 .env 与内置提示词，保证对话不中断。
   */
  private async loadRuntime() {
    const runtime: RuntimeConfig = {
      apiKey: this.cfg.apiKey,
      baseURL: this.cfg.baseURL,
      model: this.cfg.model,
      temperature: 0.1,
      enabled: this.cfg.enabled,
      prompts: {},
      tools: null,
    };

    try {
      const model: any = await queryOne('SELECT * FROM ai_model_config WHERE enabled = 1 ORDER BY id LIMIT 1');
      if (model) {
        runtime.apiKey = model.api_key || runtime.apiKey;
        runtime.baseURL = model.base_url || runtime.baseURL;
        runtime.model = model.model || runtime.model;
        runtime.temperature = Number(model.temperature);
        runtime.enabled = Boolean(runtime.apiKey);
      }

      const prompts = await query<any>('SELECT code, content FROM ai_prompt_template WHERE enabled = 1');
      for (const row of prompts) {
        runtime.prompts[row.code] = row.content;
      }

      const tools = await query<any>('SELECT code, enabled FROM ai_function_tool');
      if (tools.length) {
        runtime.tools = new Set(tools.filter((row) => Number(row.enabled) === 1).map((row) => row.code));
      }
    } catch (e: any) {
      this.logger.warn(`读取 AI 运行时配置失败，改用默认配置：${e.message}`);
    }

    this.runtime = runtime;
  }

  private llm() {
    const runtime = this.runtime;
    const apiKey = runtime ? runtime.apiKey : this.cfg.apiKey;
    const baseURL = runtime ? runtime.baseURL : this.cfg.baseURL;
    const model = runtime ? runtime.model : this.cfg.model;
    const temperature = runtime ? runtime.temperature : 0.1;
    return new ChatOpenAI({ apiKey, configuration: { baseURL }, model, temperature, streaming: true });
  }

  /** 规则兜底（未配置 API Key 或 LLM 异常时），直接查库给出确定答案 */
  private async fallback(question: string, emit: StepEmitter) {
    await emit({ agent: 'main', agentLabel: '调度主管', kind: 'think', detail: '未配置 LLM API Key，启用规则引擎兜底（多意图分派）' });
    const q0 = question || '';
    const wh = /中央仓|中央/.test(q0) ? 1 : /华东/.test(q0) ? 2 : undefined;
    const whName = wh === 1 ? '中央仓' : wh === 2 ? '华东仓' : '全部仓库';
    const kw = (q0.match(/(充电器|数据线|耳机|充电宝|键盘|鼠标)/) || [])[0] || '';
    // 意图识别：一条问题可命中多个意图
    const intents = [] as string[];
    if (/趋势|统计|占比|分布|分析|近\s*\d+\s*天/.test(q0)) intents.push('stats');
    if (/临期|过期|保质期/.test(q0)) intents.push('expire');
    if (/超储|积压/.test(q0)) intents.push('overstock');
    if (/预警|补货|低于|安全库存|不够|缺|还够/.test(q0)) intents.push('warning');
    if (/单据|入库单|出库单|移库|盘点单|调整单/.test(q0) && !/库存|还有多少|多少件/.test(q0)) intents.push('order');
    if (intents.length === 0) intents.push('inventory');

    const answerParts: string[] = [];
    const tables: any[] = [];

    if (intents.includes('inventory') || intents.includes('warning')) {
      const t0 = Date.now();
      await emit({ agent: 'inventory_expert', agentLabel: '库存查询专家', kind: 'think', detail: `主管分派任务：查询${whName}${kw ? '「' + kw + '」' : ''}实时库存` });
      const r = await this.registry.query_inventory_summary({ warehouseId: wh });
      await emit({ agent: 'inventory_expert', agentLabel: '库存查询专家', kind: 'tool', detail: `query_inventory_summary(${wh ? 'warehouseId=' + wh : '全部仓库'})`, ms: Date.now() - t0 });
      const rows = ((await this.registry.query_realtime_inventory({ warehouseId: wh, keyword: kw })).data as any[]);
      if (intents.includes('inventory')) {
        const s = r.data as any;
        tables.push({ title: `${whName}实时库存汇总`, rows });
        answerParts.push(`## ${whName}实时库存汇总\n\n总库存：在库 **${s.onhand}** 件，冻结 **${s.frozen}** 件，可用 **${s.available}** 件（共 ${s.records} 条库存记录，涉及 ${s.skus} 个 SKU）\n\n| 商品 | 编码 | 库位 | 批次 | 在库量 | 冻结量 | 可用量 |\n| --- | --- | --- | --- | --- | --- | --- |\n${rows.map((x) => `| ${x.goods_name} | ${x.goods_code} | ${x.location_code} | ${x.batch_no} | ${x.onhand_qty} | ${x.locked_qty} | ${x.available_qty} |`).join('\n')}`);
      }
    }
    if (intents.includes('warning')) {
      const t0 = Date.now();
      await emit({ agent: 'warning_expert', agentLabel: '预警分析专家', kind: 'think', detail: '主管分派任务：对照安全库存线列出缺口并给出补货建议' });
      const r = await this.registry.query_low_stock();
      await emit({ agent: 'warning_expert', agentLabel: '预警分析专家', kind: 'result', detail: r.summary, ms: Date.now() - t0 });
      const rows = (r.data as any[]).filter((x) => !kw || String(x.goods_name).includes(kw));
      if (!rows.length) {
        answerParts.push(`## 补货建议\n${kw ? '「' + kw + '」' : '全部商品'}库存均在安全线以上，**无需补货**。`);
      } else {
        const suppliers = ((await this.registry.search_partner({ keyword: '' })).data as any[]).filter((p) => Number(p.type) === 1);
        const pick = (i: number) => suppliers.length ? `${suppliers[i % suppliers.length].name}（${suppliers[i % suppliers.length].code}）` : '未维护供应商';
        tables.push({ title: '低库存预警与补货建议', rows: rows.map((x, i) => ({ ...x, suggest_qty: Math.max(Number(x.gap) * 2, Number(x.gap)), supplier: pick(i) })) });
        answerParts.push(`## 低库存预警与补货建议（${rows.length} 项）\n| 商品 | 安全库存 | 可用量 | 缺口 | 等级 | 建议补货量 | 建议供应商 |\n| --- | --- | --- | --- | --- | --- | --- |\n${rows.map((x, i) => `| ${x.goods_name} | ${x.min_stock} | ${x.available} | ${x.gap} | ${x.level} | ${Math.max(Number(x.gap) * 2, Number(x.gap))} | ${pick(i)} |`).join('\n')}\n\n> 补货量口径：max(缺口×2, 缺口)；等级“严重”= 可用量 ≤ 安全库存 50%。`);
      }
    }
    if (intents.includes('overstock')) {
      const r = await this.registry.query_overstock();
      await emit({ agent: 'warning_expert', agentLabel: '预警分析专家', kind: 'tool', detail: r.summary });
      tables.push({ title: '超储清单', rows: r.data as any[] });
      answerParts.push(`## 超储预警（${(r.data as any[]).length} 项）\n| 商品 | 库存上限 | 可用量 | 超出 |\n| --- | --- | --- | --- |\n${(r.data as any[]).map((x: any) => `| ${x.goods_name} | ${x.max_stock} | ${x.available} | ${Number(x.available) - Number(x.max_stock)} |`).join('\n')}`);
    }
    if (intents.includes('expire')) {
      const days = Number((q0.match(/(\d+)\s*天/) || [])[1] || 30);
      const r = await this.registry.query_expiring({ days });
      await emit({ agent: 'warning_expert', agentLabel: '预警分析专家', kind: 'tool', detail: r.summary });
      tables.push({ title: `未来 ${days} 天临期库存`, rows: r.data as any[] });
      answerParts.push(`## 临期预警（${days} 天内）\n| 商品 | 库位 | 批次 | 数量 | 到期日 | 剩余天数 |\n| --- | --- | --- | --- | --- | --- |\n${(r.data as any[]).map((x: any) => `| ${x.goods_name} | ${x.location_code} | ${x.batch_no} | ${x.qty} | ${String(x.expire_at).slice(0, 10)} | ${x.remain_days} |`).join('\n')}`);
    }
    if (intents.includes('stats')) {
      const days = Number((q0.match(/近\s*(\d+)\s*天/) || [])[1] || 7);
      const type = /入库/.test(q0) && !/出库/.test(q0) ? 'inbound' : 'outbound';
      await emit({ agent: 'stats_expert', agentLabel: '统计分析专家', kind: 'think', detail: `主管分派任务：统计近 ${days} 天${type === 'inbound' ? '入库' : '出库'}趋势` });
      const r = await this.registry.query_stats_trend({ type, days });
      await emit({ agent: 'stats_expert', agentLabel: '统计分析专家', kind: 'tool', detail: `query_stats_trend(type=${type},days=${days})` });
      const rows = r.data as any[];
      const tot = rows.reduce((a, b) => a + Number(b.qty || 0), 0);
      tables.push({ title: `近 ${days} 天${type === 'inbound' ? '入库' : '出库'}趋势`, rows });
      answerParts.push(`## 近 ${days} 天${type === 'inbound' ? '入库' : '出库'}趋势\n累计 **${tot}** 件。\n\n| 日期 | 数量 |\n| --- | --- |\n${rows.map((x) => `| ${String(x.dt).slice(0, 10)} | ${x.qty} |`).join('\n')}`);
      if (intents.length === 1) {
        return { answer: answerParts[0] + '\n\n> 规则兜底模式（未配置 DEEPSEEK_API_KEY）：配置后可获得完整多专家协同解读。', tables };
      }
    }
    if (intents.includes('order')) {
      const r = await this.registry.query_inbound_orders({ limit: 10 });
      await emit({ agent: 'order_expert', agentLabel: '单据管理专家', kind: 'tool', detail: 'query_inbound_orders(limit=10)' });
      tables.push({ title: '最近入库单', rows: r.data as any[] });
      answerParts.push(`## 最近入库单\n| 单号 | 仓库 | 状态 | 数量 |\n| --- | --- | --- | --- |\n${(r.data as any[]).map((x) => `| ${x.order_no} | ${x.warehouse_id} | ${x.status} | ${x.total_qty} |`).join('\n')}`);
    }

    const answer = answerParts.join('\n\n') + '\n\n> 当前为**规则兜底模式**（未配置 DEEPSEEK_API_KEY），以上结论由规则引擎分派专家工具直查库表得出；配置 API Key 后调度主管会做自然语言理解与更完整的协同分析。';
    return { answer, tables };
  }

  private async runExpert(def: (typeof EXPERT_DEFS)[number], task: string, emit: StepEmitter) {
    const tools: any[] = [];
    const draftSchema = z.object({
      warehouseId: z.number().describe('仓库 ID'),
      partnerId: z.number().optional().describe('供应商/客户 ID'),
      orderType: z.string().optional().describe('单据类型，如 PURCHASE / SALES'),
      remark: z.string().optional(),
      items: z.array(z.object({
        goodsId: z.number(), locationId: z.number(), batchNo: z.string().optional(),
        qty: z.number(), price: z.number().optional(),
        productionAt: z.string().optional(), expireAt: z.string().optional(),
      })).describe('单据明细行'),
    });

    for (const t of def.tools) {
      // 后台停用的工具不再注册给专家；表里没有登记记录时保持原有全量工具
      if (this.runtime?.tools && !this.runtime.tools.has(t)) continue;

      if (t === 'create_inbound_draft' || t === 'create_outbound_draft') {
        const isIn = t === 'create_inbound_draft';
        tools.push(tool(
          async (a: any) => {
            const svc: any = isIn ? this.inbound : this.outbound;
            if (!svc) throw new Error('服务未就绪');
            const t0 = Date.now();
            await emit({ agent: def.name, agentLabel: def.label, kind: 'tool', detail: `${t}(${JSON.stringify(a || {}).slice(0, 120)})` });
            const r = await svc.create({ ...a, source: 'AI', createBy: 'ai-agent' });
            await emit({ agent: def.name, agentLabel: def.label, kind: 'result', detail: `已生成${isIn ? '入库' : '出库'}草稿 ${r.orderNo}`, ms: Date.now() - t0 });
            const items = Array.isArray(a.items) ? a.items : [];
            const qty = items.reduce((s: number, it: any) => s + Number(it.qty || 0), 0);
            const amount = items.reduce((s: number, it: any) => s + Number(it.qty || 0) * Number(it.price || 0), 0);
            return [
              `已创建${isIn ? '入库' : '出库'}草稿单 **${r.orderNo}**（status=0，库存未变动）`,
              '',
              '| 项目 | 内容 |',
              '| --- | --- |',
              `| 单号 | ${r.orderNo}（草稿状态） |`,
              `| 单据类型 | ${a.orderType || (isIn ? '采购入库' : '销售出库')} |`,
              `| 仓库 | ID ${a.warehouseId} |`,
              `| ${isIn ? '供应商' : '客户'} | ID ${a.partnerId || '-'} |`,
              `| 明细行数 | ${items.length} |`,
              `| 总数量 | ${qty} |`,
              `| 总金额 | ${amount.toFixed(2)} |`,
              `| 备注 | ${a.remark || '待人工补充'} |`,
              '',
              '> 注意：必须人工审核后才会过账；草稿不改变库存，可在单据管理中修改或删除。',
            ].join('\n');
          },
          {
            name: t,
            description: isIn ? '创建入库单草稿（status=0，需人工审核后才影响库存）' : '创建出库单草稿（逐行校验可用库存，不足整单拒绝）',
            schema: draftSchema,
          },
        ));
        continue;
      }
      const fn = (this.registry as any)[t];
      if (typeof fn !== 'function') continue;
      tools.push(tool(
        async (a: any) => {
          const t0 = Date.now();
          await emit({ agent: def.name, agentLabel: def.label, kind: 'tool', detail: `${t}(${JSON.stringify(a || {}).slice(0, 120)})` });
          try {
            const r = await fn(a || {});
            await emit({ agent: def.name, agentLabel: def.label, kind: 'result', detail: `${t} → ${r.summary || '完成'}`, ms: Date.now() - t0 });
            return JSON.stringify(r.data ?? r.summary).slice(0, 8000);
          } catch (e: any) {
            await emit({ agent: def.name, agentLabel: def.label, kind: 'error', detail: `${t} 失败：${e.message}`, ms: Date.now() - t0 });
            return `工具调用失败：${e.message}`;
          }
        },
        { name: t, description: `${t}：查询真实 WMS 数据库`, schema: z.object({}).passthrough() },
      ));
    }

    const agent = createAgent({
      model: this.llm() as any,
      tools: tools as any,
      systemPrompt: this.runtime?.prompts[def.name] || def.prompt,
    } as any);
    const r: any = await agent.invoke({ messages: [new HumanMessage(task)] });
    const msgs = r?.messages || [];
    const content = String(msgs[msgs.length - 1]?.content ?? '');
    // 标准 ToolMessage 才是工具输出，早期版本里的 tool_call_outputs 并不存在
    const toolData: any[] = [];
    for (const m of msgs) {
      const isTool = m instanceof ToolMessage || (m as any).getType?.() === 'tool' || (m as any)._getType?.() === 'tool' || (m as any).role === 'tool';
      if (!isTool) continue;
      const raw = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      try { toolData.push(JSON.parse(raw)); } catch { toolData.push(raw); }
    }
    return { content, toolData };
  }

  /** 处理一轮对话：步骤落库 + 流式推送 */
  async handle(sessionId: number, question: string, emit: StepEmitter, signal?: AbortSignal) {
    const started = Date.now();
    let answer = '';
    const tables: any[] = [];
    try {
      if (signal?.aborted) return { answer: '', tables: [] };
      await this.loadRuntime();
      if (!this.runtime?.enabled) {
        const r = await this.fallback(question, emit);
        answer = r.answer;
        for (const t of r.tables) await this.pushTable(sessionId, t.title, t.rows);
        return r;
      }
      await emit({ agent: 'main', agentLabel: '调度主管', kind: 'think', detail: '主管正在分析问题…' });
      // 官方子智能体模式：4 位专家是主管真正可调用的工具，各自携带专属数据工具、上下文隔离
      const expertTools = EXPERT_DEFS.map((d) => tool(
        async ({ task }: { task: string }) => {
          await emit({ agent: d.name, agentLabel: d.label, kind: 'think', detail: `主管分派任务：${String(task).slice(0, 160)}` });
          await emit({ agent: d.name, agentLabel: d.label, kind: 'think', detail: `${d.label}接手该子任务` });
          const t0 = Date.now();
          try {
            const er = await this.runExpert(d, String(task), emit);
            await emit({ agent: d.name, agentLabel: d.label, kind: 'result', detail: `专家已完成：${er.content.slice(0, 160)}`, ms: Date.now() - t0 });
            for (const td of er.toolData) {
              if (td && typeof td === 'object' && ('structure' in td || Array.isArray(td))) {
                const title = `${d.label}数据`;
                const rows = Array.isArray(td) ? td : (Array.isArray(td.structure) ? td.structure : [td]);
                if (!rows.length) continue;
                await this.pushTable(sessionId, title, rows);
                tables.push({ title, rows });
              }
            }
            return er.content;
          } catch (e: any) {
            await emit({ agent: d.name, agentLabel: d.label, kind: 'error', detail: e.message });
            return `专家执行失败：${e.message}`;
          }
        },
        {
          name: d.name,
          description: d.prompt.slice(0, 200),
          schema: z.object({ task: z.string().describe('交给该专家的具体任务，包含仓库、商品等条件') }),
        },
      ));
      const main = createAgent({
        model: this.llm() as any,
        systemPrompt: this.runtime?.prompts['main'] || MAIN_PROMPT,
        tools: expertTools as any,
      } as any);
      const history = await query('SELECT role, content FROM ai_message WHERE session_id=? AND role IN (?, ?) ORDER BY id DESC LIMIT 10', [sessionId, 'user', 'assistant']);
      const historyText = history.reverse().map((m: any) => `${m.role === 'user' ? '用户' : '助手'}：${String(m.content).slice(0, 500)}`).join('\n');
      const input = `${historyText ? '近期对话：\n' + historyText + '\n\n' : ''}当前问题：${question}`;
      const r: any = await main.invoke({ messages: [new HumanMessage(input)] });
      const all = r?.messages || [];
      answer = String(all[all.length - 1]?.content ?? '');
      return { answer, tables };
    } catch (e: any) {
      this.logger.warn(`agent handle failed: ${e.message}`);
      await emit({ agent: 'main', agentLabel: '调度主管', kind: 'error', detail: `LLM 调用失败（${e.message}），切换规则兜底` });
      const r = await this.fallback(question, emit);
      answer ||= r.answer;
      return r;
    } finally {
      try {
        await emit({ agent: 'main', agentLabel: '调度主管', kind: 'done', detail: `主管整合最终答复（耗时 ${((Date.now() - started) / 1000).toFixed(1)}s）`, ms: Date.now() - started });
      } catch { /* 步骤落库失败不影响最终答复 */ }
    }
  }

  private async pushTable(sessionId: number, title: string, data: any) {
    try {
      const body = `@@TABLE@@${title}\n${JSON.stringify(data).slice(0, 18000)}`;
      await query('INSERT INTO ai_message (session_id, role, content) VALUES (?,?,?)', [sessionId, 'table', body]);
    } catch { /* ignore */ }
  }

  // ---- 会话/消息持久化 ----
  async listSessions(userId: number) {
    return query(`SELECT s.id, s.title, s.last_time, s.last_time AS update_time, s.create_time, s.agent_count, s.tool_count,
        (SELECT COUNT(*) FROM ai_message m WHERE m.session_id=s.id AND m.role IN ('user','assistant')) AS msg_count
      FROM ai_session s WHERE s.user_id=? ORDER BY s.last_time DESC`, [userId]);
  }
  async createSession(userId: number, title = '新会话') {
    const r = await query<unknown>('INSERT INTO ai_session (user_id, title) VALUES (?,?)', [userId, title]) as any;
    return { id: r.insertId, title };
  }
  async renameSession(userId: number, id: number, title: string) {
    await query('UPDATE ai_session SET title=? WHERE id=? AND user_id=?', [title, id, userId]);
    return { success: true };
  }
  async deleteSession(userId: number, id: number) {
    await query('DELETE FROM ai_message WHERE session_id=?', [id]);
    await query('DELETE FROM ai_step WHERE session_id=?', [id]);
    await query('DELETE FROM ai_session WHERE id=? AND user_id=?', [id, userId]);
    return { success: true };
  }
  async messages(sessionId: number) {
    const rows = await query('SELECT id, role, content, elapsed, create_time FROM ai_message WHERE session_id=? ORDER BY id', [sessionId]);
    return rows.map((m: any) => {
      const txt = String(m.content || '');
      if (m.role === 'table' && txt.startsWith('@@TABLE@@')) {
        const nl = txt.indexOf('\n');
        try { return { ...m, role: 'table', meta: { title: txt.slice(9, nl), rows: JSON.parse(txt.slice(nl + 1)) }, content: '' }; }
        catch { return { ...m, role: 'table', meta: null, content: '' }; }
      }
      return { ...m, meta: null };
    });
  }
  /** 步骤回放：event 还原成前端 kind，elapsed 秒还原成毫秒 */
  async steps(sessionId: number) {
    return query(`SELECT id, message_id, actor AS agent, actor AS agentLabel,
        CASE event WHEN 'start' THEN 'think' WHEN 'start_tool' THEN 'tool'
                   WHEN 'result' THEN 'result' WHEN 'end' THEN 'done' ELSE 'error' END AS kind,
        content AS detail, elapsed * 1000 AS ms, create_time
      FROM ai_step WHERE session_id=? ORDER BY id`, [sessionId]);
  }
  async addStep(session: { id?: number } | null, s: any, messageId = 0) {
    if (!session?.id) return;
    const actorType = s.kind === 'tool' || s.kind === 'result' || s.kind === 'error' ? 'tool' : 'agent';
    const event = s.kind === 'think' ? 'start' : s.kind === 'tool' ? 'start_tool'
      : s.kind === 'result' ? 'result' : s.kind === 'done' ? 'end' : 'error';
    await query('INSERT INTO ai_step (session_id, message_id, actor, actor_type, event, content, elapsed) VALUES (?,?,?,?,?,?,?)',
      [session.id, messageId, String(s.agentLabel || s.agent || '调度主管').slice(0, 64), actorType, event,
       String(s.detail || '').slice(0, 2000), Number(s.ms || 0) / 1000]);
  }
  async hasMessages(sessionId: number) {
    const r = await queryOne('SELECT id FROM ai_message WHERE session_id=? LIMIT 1', [sessionId]);
    return !!r;
  }
  /** 先落一条空的 assistant 消息，拿 id 关联本轮全部执行步骤 */
  async createMessage(sessionId: number, role: string, content = '') {
    const r = await query<unknown>('INSERT INTO ai_message (session_id, role, content) VALUES (?,?,?)', [sessionId, role, content]) as any;
    return Number(r.insertId);
  }
  async finishMessage(id: number, content: string, elapsedSeconds = 0) {
    await query('UPDATE ai_message SET content=?, elapsed=? WHERE id=?', [content, elapsedSeconds, id]);
    await query(`UPDATE ai_session SET last_time=NOW(),
        tool_count = (SELECT COUNT(*) FROM ai_step WHERE session_id=(SELECT session_id FROM ai_message WHERE id=?) AND event='start_tool'),
        agent_count = (SELECT COUNT(DISTINCT actor) FROM ai_step WHERE session_id=(SELECT session_id FROM ai_message WHERE id=?) AND actor <> '调度主管')
      WHERE id=(SELECT session_id FROM ai_message WHERE id=?)`, [id, id, id]);
  }
  async saveMessage(sessionId: number, role: string, content: string) {
    await query('INSERT INTO ai_message (session_id, role, content) VALUES (?,?,?)', [sessionId, role, content]);
    await query('UPDATE ai_session SET last_time=NOW() WHERE id=?', [sessionId]);
  }
}

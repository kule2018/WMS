<template>
  <div class="flex gap-3 h-[calc(100vh-110px)] min-h-[520px]">
    <!-- 会话列表 -->
    <DsCard class="w-56 shrink-0" :pad="true" title="会话">
      <template #extra><DsButton variant="text" size="sm" @click="newSession"><IconFont name="Plus" :size="14" />新会话</DsButton></template>
      <div class="space-y-1 max-h-[calc(100vh-210px)] overflow-auto">
        <div
          v-for="s in sessions" :key="s.id"
          class="group flex items-start gap-1 p-2 rounded cursor-pointer text-sm"
          :style="s.id === sessionId ? 'background:var(--ds-brand-soft);color:var(--ds-brand)' : ''"
          @click="switchSession(s.id)"
        >
          <div class="flex-1 min-w-0">
            <div class="truncate font-medium">{{ s.title || '新会话' }}</div>
            <div class="ds-muted mt-0.5">{{ s.update_time || s.last_time || s.create_time }}{{ s.msg_count ? ' · ' + s.msg_count + '条' : '' }}</div>
          </div>
          <DsButton variant="text" size="sm" class="opacity-0 group-hover:opacity-100" @click.stop="deleteSession(s.id)">
            <IconFont name="Delete" :size="13" />
          </DsButton>
        </div>
        <div v-if="!sessions.length" class="ds-muted text-center py-6">暂无历史会话</div>
      </div>
    </DsCard>

    <!-- 对话区 -->
    <DsCard class="flex-1 min-w-0" :pad="false">
      <div class="h-12 px-4 flex items-center gap-2 border-b" style="border-color:var(--ds-border)">
        <span class="font-bold flex items-center gap-1"><IconFont name="Sparkles" :size="17" />仓储多Agent</span>
        <DsTag size="sm" color="neutral">调度主管</DsTag>
        <DsTag size="sm" color="brand">深度思考</DsTag>
        <DsTag v-for="e in experts" :key="e.key" size="sm" :color="e.color">{{ e.name }}</DsTag>
        <span class="flex-1" />
        <span v-if="running" class="ds-muted">正在协同…</span>
        <DsButton v-if="running" variant="danger" size="sm" @click="abort"><IconFont name="Stop" :size="13" />停止生成</DsButton>
      </div>

      <div ref="scrollEl" class="flex-1 overflow-auto p-4 space-y-4" style="height:calc(100% - 160px)">
        <!-- 欢迎屏 -->
        <div v-if="!messages.length && !running" class="text-center pt-16">
          <div class="text-4xl mb-3">📦</div>
          <h2 class="text-lg font-semibold">您好，我是仓储多Agent智能助手</h2>
          <p class="ds-muted mt-1">由调度主管协同 4 位专家为您服务，数据实时对接 WMS 数据库</p>
          <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 max-w-4xl mx-auto mt-6">
            <div v-for="e in welcomeCards" :key="e.key" class="rounded-lg border p-3 text-left text-xs" style="border-color:var(--ds-border)">
              <div class="font-medium text-sm mb-1">{{ e.name }}</div>
              <div class="ds-muted">{{ e.desc }}</div>
            </div>
          </div>
          <div class="flex flex-wrap justify-center gap-2 mt-6">
            <DsButton v-for="p in prompts" :key="p" size="sm" @click="quickAsk(p)">{{ p }}</DsButton>
          </div>
        </div>

        <template v-for="(m, i) in messages" :key="m.id || i">
          <div v-if="m.role === 'user'" class="flex justify-end">
            <div class="max-w-[75%] rounded-lg px-4 py-2 text-sm text-white whitespace-pre-wrap" style="background:var(--ds-brand)">{{ m.content }}</div>
          </div>
          <div v-else class="space-y-2">
            <!-- 执行步骤时间线 -->
            <div v-if="(m.steps || []).length" class="rounded-lg border text-sm overflow-hidden" style="border-color:var(--ds-border)">
              <div
                class="px-3 py-2 flex items-center justify-between cursor-pointer text-xs"
                style="background:var(--ds-bg-soft);color:var(--ds-text-2)"
                @click="m.open = !m.open"
              >
                <span>共 {{ (m.steps || []).length }} 步 · 已协同 {{ m.expertCount ?? uniqueExperts(m.steps) }} 位专家 · {{ m.toolCount ?? toolCalls(m.steps) }} 次工具调用 · {{ m.elapsed ?? 0 }}s</span>
                <span>{{ m.open ? '收起 ▲' : '展开 ▼' }}</span>
              </div>
              <div v-show="m.open !== false" class="p-2 space-y-1 max-h-72 overflow-auto">
                <div v-for="(s, j) in m.steps" :key="j" class="flex items-start gap-2 text-xs py-1">
                  <span class="w-4 h-4 rounded-full text-white flex items-center justify-center shrink-0 mt-0.5" style="font-size:10px;background:#2ba471">✓</span>
                  <DsTag size="sm" :color="roleColor(s.agent || s.role)">{{ roleName(s.agent || s.role) }}</DsTag>
                  <span class="flex-1" style="color:var(--ds-text-2)">
                    {{ s.detail || s.summary || s.content }}
                    <span v-if="s.ms" class="ds-muted ml-1">{{ (Number(s.ms) / 1000).toFixed(1) }}s</span>
                  </span>
                </div>
              </div>
            </div>
            <!-- 最终答复 -->
            <DsMarkdown :content="m.content || ''" />
            <!-- 数据表格 -->
            <div v-for="(t, ti) in m.tables || []" :key="ti">
              <div class="ds-muted mt-2">{{ t.title || '查询结果' }}</div>
              <DsTable :columns="dynamicColumns(t.rows)" :data="t.rows || []" />
            </div>
          </div>
        </template>

        <!-- 流式中的当前回答 -->
        <div v-if="running" class="space-y-2">
          <div v-if="streamSteps.length" class="rounded-lg border p-2 text-xs" style="border-color:var(--ds-border)">
            <div class="ds-muted mb-2">正在协同处理中… 共 {{ streamSteps.length }} 步 · 已协同 {{ curExperts.size }} 位专家 · {{ toolCount }} 次工具调用</div>
            <div v-for="(s, j) in streamSteps" :key="j" class="flex items-start gap-2 py-1">
              <span class="w-4 h-4 rounded-full text-white flex items-center justify-center shrink-0 mt-0.5" style="font-size:10px;background:#e6a23c">…</span>
              <DsTag size="sm" :color="roleColor(s.role)">{{ roleName(s.role) }}</DsTag>
              <span class="flex-1" style="color:var(--ds-text-2)">{{ s.summary }}</span>
            </div>
          </div>
          <DsMarkdown v-if="streamText" :content="streamText" streaming />
          <div v-else class="ds-muted flex items-center gap-2"><IconFont name="Refresh" :size="14" class="animate-spin" />调度主管正在分派任务…</div>
        </div>
      </div>

      <!-- 输入区 -->
      <div class="p-3 border-t" style="border-color:var(--ds-border)" @keyup.enter="onKey">
        <div class="flex items-end gap-2">
          <DsInput v-model="input" type="textarea" :rows="2" :autosize="true" placeholder="请输入您的问题，Enter 发送，Shift+Enter 换行" style="flex:1" />
          <DsButton variant="primary" :disabled="running || !input.trim()" @click="send"><IconFont name="Send" :size="15" />发送</DsButton>
        </div>
        <div class="ds-muted mt-1">AI 只能生成 status=0 的草稿单，库存变更仍需人工审核。</div>
      </div>
    </DsCard>

    <!-- AI 代建草稿提示 -->
    <DsModal v-model="draftVisible" title="AI 已生成草稿单" :width="480" :resizable="false">
      <p class="text-sm">检测到 AI 已代建单据草稿：<b style="color:var(--ds-brand)">{{ draft.no }}</b></p>
      <p class="ds-muted mt-2">草稿状态为 0，尚未影响库存。请在对应单据页核对明细后提交审核。</p>
      <template #footer>
        <div class="flex justify-end gap-2">
          <DsButton @click="draftVisible = false">稍后处理</DsButton>
          <DsButton variant="primary" @click="goDraft">前往查看</DsButton>
        </div>
      </template>
    </DsModal>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { confirm } from '@/components';
import http from '@/utils/request';

const router = useRouter();
const experts = [
  { key: 'inventory_expert', name: '库存查询专家', color: 'brand', desc: '实时库存、库存流水、仓库库位结构' },
  { key: 'order_expert', name: '单据管理专家', color: 'success', desc: '六类单据查询、代建出入库草稿' },
  { key: 'warning_expert', name: '预警分析专家', color: 'warning', desc: '低库存、超储、临期与补货建议' },
  { key: 'stats_expert', name: '统计分析专家', color: 'neutral', desc: '出入库趋势、库存结构、单据分布' },
];
const welcomeCards = [
  { key: 'main', name: '调度主管', desc: '理解问题、拆分任务、分派专家、汇总答案', color: 'neutral' },
  ...experts,
];
const prompts = ['查看低于安全线的商品', '统计近 30 天出入库趋势', '中央仓的充电器还够不够？', '帮我生成一张入库单草稿'];
const labelMap: Record<string, string> = {
  main: '调度主管', '调度主管': '调度主管', inventory_expert: '库存查询专家', order_expert: '单据管理专家',
  warning_expert: '预警分析专家', stats_expert: '统计分析专家',
  inventory: '库存查询专家', order: '单据管理专家', warning: '预警分析专家', stats: '统计分析专家',
};
const colorMap: Record<string, string> = {
  main: 'brand', inventory_expert: 'brand', order_expert: 'success', warning_expert: 'warning', stats_expert: 'neutral',
};
function roleName(k: any) { return labelMap[k] || (k ? String(k) : '调度主管'); }
function roleColor(k: any) { return colorMap[k] || (String(k || '').includes('专家') ? 'brand' : 'neutral'); }
function uniqueExperts(steps: any[]) { return new Set((steps || []).map((s) => s.agent || s.role).filter((a) => a && a !== 'main')).size; }
function toolCalls(steps: any[]) { return (steps || []).filter((s) => s.kind === 'tool' || s.kind === 'start_tool').length; }
function dynamicColumns(rows: any[]) {
  const first = Array.isArray(rows) ? rows[0] : null;
  if (!first || typeof first !== 'object') return [{ title: '结果', key: 'value' }];
  return Object.keys(first).map((k) => ({ title: k, key: k, minWidth: '110px' }));
}

const sessions = ref<any[]>([]);
const sessionId = ref<number | null>(null);
const messages = ref<any[]>([]);
const input = ref('');
const running = ref(false);
const streamSteps = ref<any[]>([]);
const streamText = ref('');
const curExperts = ref<Set<string>>(new Set());
const toolCount = ref(0);
const scrollEl = ref<HTMLElement>();
const draftVisible = ref(false);
const draft = ref<any>({ no: '', kind: 'inbound' });
let ctrl: AbortController | null = null;

function scroll() { nextTick(() => { const el = scrollEl.value; if (el) el.scrollTop = el.scrollHeight; }); }
async function loadSessions() { sessions.value = await http.get('/agent/sessions'); }
async function switchSession(id: number) {
  sessionId.value = id;
  const [ms, st]: any = await Promise.all([
    http.get(`/agent/sessions/${id}/messages`), http.get(`/agent/sessions/${id}/steps`),
  ]);
  const byMsg: Record<number, any[]> = {};
  (st || []).forEach((s: any) => { (byMsg[s.message_id] = byMsg[s.message_id] || []).push(s); });
  const list: any[] = [];
  (ms || []).forEach((m: any) => {
    if (m.role === 'table') {
      if (list.length) (list[list.length - 1].tables = list[list.length - 1].tables || []).push({ title: m.meta?.title || '查询结果', rows: m.meta?.rows || [] });
      return;
    }
    list.push({ ...m, steps: byMsg[m.id] || [], tables: [], open: false, expertCount: uniqueExperts(byMsg[m.id] || []), toolCount: toolCalls(byMsg[m.id] || []) });
  });
  messages.value = list;
  scroll();
}
async function newSession() {
  const s: any = await http.post('/agent/sessions', { title: '新会话' });
  sessionId.value = s.id; messages.value = []; loadSessions();
}
async function deleteSession(id: number) {
  if (!(await confirm('确认删除该会话？消息与执行步骤将一并删除', '删除会话'))) return;
  await http.delete(`/agent/sessions/${id}`);
  if (sessionId.value === id) { sessionId.value = null; messages.value = []; }
  loadSessions();
}
function quickAsk(p: string) { input.value = p; send(); }
function onKey(e: any) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }
function abort() { ctrl?.abort(); }

async function send() {
  const question = input.value.trim();
  if (!question || running.value) return;
  input.value = '';
  if (!sessionId.value) await newSession();
  const sid = sessionId.value!;
  messages.value.push({ role: 'user', content: question });
  const ai: any = { role: 'assistant', content: '', steps: [], tables: [], open: true };
  messages.value.push(ai);
  running.value = true;
  streamSteps.value = []; streamText.value = ''; curExperts.value = new Set(); toolCount.value = 0;
  ctrl = new AbortController();
  const token = localStorage.getItem('token');
  try {
    const res = await fetch('/api/agent/chat', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ sessionId: sid, question }),
    });
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      const parts = buf.split('\n\n'); buf = parts.pop() || '';
      for (const p of parts) {
        const line = p.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        let d: any; try { d = JSON.parse(data); } catch { continue; }
        if (d.type === 'session') { sessionId.value = d.sessionId; ai.id = d.messageId || ai.id; loadSessions(); }
        else if (d.type === 'step') {
          const s = { role: d.agent || 'main', kind: d.kind || '', detail: d.detail || '', ms: d.ms || 0 };
          streamSteps.value.push(s);
          if (s.kind === 'tool') toolCount.value++;
          if (s.role && s.role !== 'main') curExperts.value.add(s.role);
          scroll();
        } else if (d.type === 'table') {
          ai.tables.push({ title: d.title || '查询结果', rows: d.rows || [] });
        } else if (d.type === 'delta') {
          streamText.value += d.text ?? '';
          scroll();
        } else if (d.type === 'done') {
          ai.content = streamText.value;
          tryOpenDraft(ai.content);
          ai.elapsed = d.elapsed ?? 0;
          ai.toolCount = d.toolCount ?? toolCount.value;
          ai.expertCount = d.expertCount ?? curExperts.value.size;
          ai.steps = [...streamSteps.value];
          ai.id = d.messageId || ai.id;
          ai.open = false;
          streamSteps.value = []; streamText.value = '';
        }
      }
    }
  } catch (e: any) {
    if (e.name !== 'AbortError') ai.content = '⚠️ 请求失败，请检查网络或后端服务（未配置大模型 API Key 时会自动使用规则兜底模式）';
  }
  if (streamText.value && !ai.content) ai.content = streamText.value;
  if (!ai.steps?.length) ai.steps = [...streamSteps.value];
  streamSteps.value = []; streamText.value = '';
  running.value = false;
  scroll(); loadSessions();
}

function tryOpenDraft(text: string) {
  const m = text.match(/(RK|CK)\d{8}\d{4}/);
  if (!m) return;
  draft.value = { no: m[0], kind: m[1] === 'RK' ? 'inbound' : 'outbound' };
  draftVisible.value = true;
}
function goDraft() {
  draftVisible.value = false;
  router.push(draft.value.kind === 'inbound' ? '/inbound' : '/outbound');
}
onMounted(async () => {
  await loadSessions();
  if (sessions.value.length) switchSession(sessions.value[0].id);
});
</script>

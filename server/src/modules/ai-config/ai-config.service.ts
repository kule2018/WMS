import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { query, queryOne, tx } from '../../common/db';

/**
 * AI 配置管理：模型配置、Prompt 模板、Function 工具、MCP 服务。
 *
 * 四类配置互不依赖，所以各自写一组增删改查，不抽通用仓储、不套泛型基类。
 * 目的很直接：任何一条 SQL 都能在当前文件里看到，排查问题不用在封装层之间跳转。
 */
@Injectable()
export class AiConfigService {
  // ==================== 一、模型配置 ====================

  /** 列表不回传 API Key 明文，只告诉前端「有没有配」，避免密钥落到浏览器缓存里 */
  async listModels() {
    const rows = await query<any>('SELECT * FROM ai_model_config ORDER BY id');
    const result: any[] = [];

    for (const row of rows) {
      const item: any = {
        id: row.id,
        name: row.name,
        provider: row.provider,
        base_url: row.base_url,
        model: row.model,
        temperature: row.temperature,
        enabled: row.enabled,
        remark: row.remark,
        create_time: row.create_time,
        has_key: false,
      };
      if (row.api_key) {
        item.has_key = true;
      }
      result.push(item);
    }

    return result;
  }

  /**
   * 保存模型配置。
   * 启用一条配置时先把其他记录全部停用，保证运行时只取到一条。
   * 编辑时 api_key 留空表示沿用旧密钥，避免把列表里的脱敏占位符写回数据库。
   */
  async saveModel(d: any) {
    // 参数不完整就直接返回，不进入后面的事务
    if (!d.name || !d.base_url || !d.model) {
      throw new BadRequestException('请填写配置名称、接口地址与模型名');
    }

    let enabledFlag = 0;
    if (d.enabled === true || Number(d.enabled) === 1) {
      enabledFlag = 1;
    }

    const provider = d.provider || 'openai_compatible';
    const temperature = Number(d.temperature ?? 0.1);
    const remark = d.remark || null;

    // 先在事务外把要执行的 SQL 和参数准备好，事务里只剩两步写库
    let writeSql = '';
    let writeParams: any[] = [];

    if (d.id) {
      if (d.api_key) {
        writeSql = 'UPDATE ai_model_config SET name=?, provider=?, base_url=?, api_key=?, model=?, temperature=?, enabled=?, remark=? WHERE id=?';
        writeParams = [d.name, provider, d.base_url, d.api_key, d.model, temperature, enabledFlag, remark, d.id];
      } else {
        writeSql = 'UPDATE ai_model_config SET name=?, provider=?, base_url=?, model=?, temperature=?, enabled=?, remark=? WHERE id=?';
        writeParams = [d.name, provider, d.base_url, d.model, temperature, enabledFlag, remark, d.id];
      }
    } else {
      writeSql = 'INSERT INTO ai_model_config (name, provider, base_url, api_key, model, temperature, enabled, remark) VALUES (?,?,?,?,?,?,?,?)';
      writeParams = [d.name, provider, d.base_url, d.api_key || '', d.model, temperature, enabledFlag, remark];
    }

    await tx(async (conn) => {
      if (enabledFlag === 1) {
        await conn.execute('UPDATE ai_model_config SET enabled = 0');
      }
      await conn.execute(writeSql, writeParams);
    });

    return { success: true };
  }

  async deleteModel(id: number) {
    const row = await queryOne('SELECT id FROM ai_model_config WHERE id=?', [id]);
    if (!row) {
      throw new NotFoundException('模型配置不存在');
    }
    await query('DELETE FROM ai_model_config WHERE id=?', [id]);
    return { success: true };
  }

  /** 调用 OpenAI 兼容的 /models 做连通性检查，不发起对话、不消耗额度 */
  async testModel(id: number) {
    const row: any = await queryOne('SELECT * FROM ai_model_config WHERE id=?', [id]);
    if (!row) {
      throw new NotFoundException('模型配置不存在');
    }
    if (!row.base_url) {
      throw new BadRequestException('接口地址为空');
    }

    const url = String(row.base_url).replace(/\/+$/, '') + '/models';
    const started = Date.now();

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${row.api_key || ''}` },
        signal: AbortSignal.timeout(8000),
      });

      if (res.ok) {
        return { ok: true, status: res.status, ms: Date.now() - started, message: '接口可访问' };
      }
      return { ok: false, status: res.status, ms: Date.now() - started, message: `接口返回 HTTP ${res.status}` };
    } catch (e: any) {
      return { ok: false, status: 0, ms: Date.now() - started, message: `连接失败：${e.message}` };
    }
  }

  // ==================== 二、Prompt 模板 ====================

  listPrompts() {
    return query('SELECT * FROM ai_prompt_template ORDER BY id');
  }

  /** 模板编码与 Agent 里的 code 对应；启用后运行时会覆盖代码内置提示词 */
  async savePrompt(d: any) {
    if (!d.code || !d.name || !d.content) {
      throw new BadRequestException('请填写模板编码、名称与模板正文');
    }

    let enabledFlag = 0;
    if (d.enabled === true || Number(d.enabled) === 1) {
      enabledFlag = 1;
    }

    const scene = d.scene || 'main';
    const variables = d.variables || null;
    const remark = d.remark || null;

    // 编辑和新增分开写，避免一条 SQL 里堆条件判断
    if (d.id) {
      await query(
        'UPDATE ai_prompt_template SET code=?, name=?, scene=?, content=?, variables=?, enabled=?, remark=? WHERE id=?',
        [d.code, d.name, scene, d.content, variables, enabledFlag, remark, d.id]);
      return { success: true };
    }

    const exists = await queryOne('SELECT id FROM ai_prompt_template WHERE code=?', [d.code]);
    if (exists) {
      throw new BadRequestException('模板编码已存在，请换一个编码');
    }

    await query(
      'INSERT INTO ai_prompt_template (code, name, scene, content, variables, enabled, remark) VALUES (?,?,?,?,?,?,?)',
      [d.code, d.name, scene, d.content, variables, enabledFlag, remark]);
    return { success: true };
  }

  async deletePrompt(id: number) {
    const row = await queryOne('SELECT id FROM ai_prompt_template WHERE id=?', [id]);
    if (!row) {
      throw new NotFoundException('Prompt 模板不存在');
    }
    await query('DELETE FROM ai_prompt_template WHERE id=?', [id]);
    return { success: true };
  }

  // ==================== 三、Function 工具 ====================

  listTools() {
    return query('SELECT * FROM ai_function_tool ORDER BY id');
  }

  /** 工具编码必须与 buildTools 返回的函数名一致，否则运行时不会注册给专家 */
  async saveTool(d: any) {
    if (!d.code || !d.name) {
      throw new BadRequestException('请填写工具编码与工具名称');
    }

    let enabledFlag = 0;
    if (d.enabled === true || Number(d.enabled) === 1) {
      enabledFlag = 1;
    }

    let writeFlag = 0;
    if (d.write_action === true || Number(d.write_action) === 1) {
      writeFlag = 1;
    }

    const owner = d.owner || 'order_expert';
    const description = d.description || null;
    const schema = d.params_schema || null;
    const remark = d.remark || null;

    if (d.id) {
      await query(
        'UPDATE ai_function_tool SET code=?, name=?, owner=?, description=?, params_schema=?, write_action=?, enabled=?, remark=? WHERE id=?',
        [d.code, d.name, owner, description, schema, writeFlag, enabledFlag, remark, d.id]);
      return { success: true };
    }

    const exists = await queryOne('SELECT id FROM ai_function_tool WHERE code=?', [d.code]);
    if (exists) {
      throw new BadRequestException('工具编码已存在');
    }

    await query(
      'INSERT INTO ai_function_tool (code, name, owner, description, params_schema, write_action, enabled, remark) VALUES (?,?,?,?,?,?,?,?)',
      [d.code, d.name, owner, description, schema, writeFlag, enabledFlag, remark]);
    return { success: true };
  }

  /** 列表里的开关单独走这个接口，避免整行表单提交时误改说明文字 */
  async setToolEnabled(id: number, enabled: number) {
    const row = await queryOne('SELECT id FROM ai_function_tool WHERE id=?', [id]);
    if (!row) {
      throw new NotFoundException('工具不存在');
    }

    let enabledFlag = 0;
    if (Number(enabled) === 1) {
      enabledFlag = 1;
    }
    await query('UPDATE ai_function_tool SET enabled=? WHERE id=?', [enabledFlag, id]);
    return { success: true };
  }

  async deleteTool(id: number) {
    const row = await queryOne('SELECT id FROM ai_function_tool WHERE id=?', [id]);
    if (!row) {
      throw new NotFoundException('工具不存在');
    }
    await query('DELETE FROM ai_function_tool WHERE id=?', [id]);
    return { success: true };
  }

  // ==================== 四、MCP 服务登记 ====================

  listMcp() {
    return query('SELECT * FROM ai_mcp_server ORDER BY id');
  }

  /**
   * MCP 只做登记与启停，不在服务端执行 stdio 命令。
   * 原因：命令来自后台配置页，由服务进程直接启动会带来任意命令执行风险。
   */
  async saveMcp(d: any) {
    if (!d.name || !d.transport) {
      throw new BadRequestException('请填写服务名称与传输方式');
    }
    if (d.transport !== 'stdio' && !d.endpoint) {
      throw new BadRequestException('HTTP/SSE 类型必须填写服务地址');
    }
    if (d.transport === 'stdio' && !d.command) {
      throw new BadRequestException('stdio 类型必须填写启动命令');
    }

    let enabledFlag = 0;
    if (d.enabled === true || Number(d.enabled) === 1) {
      enabledFlag = 1;
    }

    const endpoint = d.endpoint || '';
    const command = d.command || null;
    const args = d.args || null;
    const envJson = d.env_json || null;
    const remark = d.remark || null;

    if (d.id) {
      await query(
        'UPDATE ai_mcp_server SET name=?, transport=?, endpoint=?, command=?, args=?, env_json=?, enabled=?, remark=? WHERE id=?',
        [d.name, d.transport, endpoint, command, args, envJson, enabledFlag, remark, d.id]);
      return { success: true };
    }

    await query(
      'INSERT INTO ai_mcp_server (name, transport, endpoint, command, args, env_json, enabled, remark) VALUES (?,?,?,?,?,?,?,?)',
      [d.name, d.transport, endpoint, command, args, envJson, enabledFlag, remark]);
    return { success: true };
  }

  async deleteMcp(id: number) {
    const row = await queryOne('SELECT id FROM ai_mcp_server WHERE id=?', [id]);
    if (!row) {
      throw new NotFoundException('MCP 服务不存在');
    }
    await query('DELETE FROM ai_mcp_server WHERE id=?', [id]);
    return { success: true };
  }

  /** 校验登记信息；HTTP/SSE 类型额外做一次短超时探测并回写检测状态 */
  async testMcp(id: number) {
    const row: any = await queryOne('SELECT * FROM ai_mcp_server WHERE id=?', [id]);
    if (!row) {
      throw new NotFoundException('MCP 服务不存在');
    }

    let ok = false;
    let message = '';

    if (row.transport === 'stdio') {
      // stdio 由外部 MCP 客户端拉起，这里只确认命令登记完整
      if (row.command) {
        ok = true;
        message = '启动命令已登记，需由 MCP 客户端拉起';
      } else {
        message = '未填写启动命令';
      }
    } else if (!row.endpoint) {
      message = '未填写服务地址';
    } else {
      try {
        const res = await fetch(row.endpoint, { signal: AbortSignal.timeout(4000) });
        ok = true;
        message = `地址可访问（HTTP ${res.status}）`;
      } catch (e: any) {
        // SSE 是长连接，短超时断开属于正常现象，只记录为未确认
        message = `未在 4 秒内完成响应：${e.message}（SSE 长连接属正常）`;
      }
    }

    let statusText = '未确认';
    if (ok) {
      statusText = '正常';
    }
    await query('UPDATE ai_mcp_server SET status=?, last_check_time=NOW() WHERE id=?', [statusText, id]);
    return { ok, message };
  }
}

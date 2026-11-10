import { Body, Controller, Delete, Get, Param, Post, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { AgentService } from './agent.service';

@Controller('agent')
export class AgentController {
  constructor(private readonly svc: AgentService) {}

  @Get('sessions') listSessions(@Req() req: any) { return this.svc.listSessions(req.user?.sub || req.user?.id || 1); }
  @Post('sessions') createSession(@Req() req: any, @Body() b: any) { return this.svc.createSession(req.user?.sub || req.user?.id || 1, b?.title || '新会话'); }
  @Delete('sessions/:id') deleteSession(@Req() req: any, @Param('id') id: string) { return this.svc.deleteSession(req.user?.sub || req.user?.id || 1, Number(id)); }
  @Get('sessions/:id/messages') messages(@Param('id') id: string) { return this.svc.messages(Number(id)); }
  @Get('sessions/:id/steps') steps(@Param('id') id: string) { return this.svc.steps(Number(id)); }

  /** 一轮对话：先落库，再 SSE 推送步骤 / 表格 / 逐字答复，支持随时中断 */
  @Post('chat')
  async chat(@Req() req: any, @Body() b: { sessionId?: number; question: string }, @Res() res: Response) {
    const started = Date.now();
    const userId = req.user?.sub || req.user?.id || 1;
    const session = b.sessionId ? { id: b.sessionId } : await this.svc.createSession(userId, (b.question || '新会话').slice(0, 20));
    if (b.sessionId) {
      const first = !(await this.svc.hasMessages(b.sessionId));
      if (first) await this.svc.renameSession(userId, b.sessionId, (b.question || '新会话').slice(0, 20));
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const ac = new AbortController();
    let closed = false;
    res.on('close', () => { closed = true; if (!res.writableEnded) ac.abort(); });
    const send = (e: any) => { if (!closed && !res.writableEnded) res.write(`data: ${JSON.stringify(e)}\n\n`); };

    // 先建本轮 assistant 消息，其 id 关联所有执行步骤，保证历史回放能还原时间线
    const messageId = await this.svc.createMessage(session.id, 'assistant');
    send({ type: 'session', sessionId: session.id, messageId });
    await this.svc.saveMessage(session.id, 'user', b.question);

    let full = '';
    let toolCount = 0;
    const experts = new Set<string>();
    try {
      const result = await this.svc.handle(session.id, b.question, async (s) => {
        await this.svc.addStep(session, s, messageId);
        if (s.kind === 'tool') toolCount++;
        if (s.agent && s.agent !== 'main' && s.kind === 'think') experts.add(s.agent);
        send({ type: 'step', messageId, ...s });
      }, ac.signal);
      full = result.answer || '';
      for (const t of result.tables || []) send({ type: 'table', ...t });
    } catch (e: any) {
      full = `处理失败：${e.message}`;
    }

    // 打字机输出；客户端中断时立即停止，并只保存已输出的内容
    let emitted = '';
    for (const m of full.match(/[\s\S]{1,12}/g) || []) {
      if (closed || ac.signal.aborted) break;
      emitted += m;
      send({ type: 'delta', text: m });
      await new Promise((r) => setTimeout(r, 12));
    }
    const elapsed = Number(((Date.now() - started) / 1000).toFixed(1));
    await this.svc.finishMessage(messageId, emitted || full, elapsed);
    send({ type: 'done', messageId, elapsed, toolCount, expertCount: experts.size });
    if (!closed) { res.write('data: [DONE]\n\n'); res.end(); }
  }
}

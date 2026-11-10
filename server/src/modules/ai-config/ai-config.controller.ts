import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { AiConfigService } from './ai-config.service';

/**
 * AI 配置接口。路径按四类配置分组，与前端 /ai-config/:type 页面一一对应。
 * 每个方法只做一件事：解析路径参数、转成数字、交给 Service，不在这里写业务判断。
 */
@Controller('ai-config')
export class AiConfigController {
  constructor(private readonly svc: AiConfigService) {}

  // 模型配置：列表、保存（新增/修改）、连通性测试、删除
  @Get('model/list')
  listModels() {
    return this.svc.listModels();
  }

  @Post('model')
  saveModel(@Body() body: any) {
    return this.svc.saveModel(body);
  }

  @Post('model/:id/test')
  testModel(@Param('id') id: string) {
    return this.svc.testModel(Number(id));
  }

  @Delete('model/:id')
  deleteModel(@Param('id') id: string) {
    return this.svc.deleteModel(Number(id));
  }

  // Prompt 模板：列表、保存（新增/修改）、删除
  @Get('prompt/list')
  listPrompts() {
    return this.svc.listPrompts();
  }

  @Post('prompt')
  savePrompt(@Body() body: any) {
    return this.svc.savePrompt(body);
  }

  @Delete('prompt/:id')
  deletePrompt(@Param('id') id: string) {
    return this.svc.deletePrompt(Number(id));
  }

  // Function 工具：列表、保存（新增/修改）、单独启停、删除
  @Get('tool/list')
  listTools() {
    return this.svc.listTools();
  }

  @Post('tool')
  saveTool(@Body() body: any) {
    return this.svc.saveTool(body);
  }

  @Put('tool/:id/enabled')
  setToolEnabled(@Param('id') id: string, @Body() body: any) {
    return this.svc.setToolEnabled(Number(id), Number(body.enabled));
  }

  @Delete('tool/:id')
  deleteTool(@Param('id') id: string) {
    return this.svc.deleteTool(Number(id));
  }

  // MCP 服务：列表、保存（新增/修改）、连通性测试、删除
  @Get('mcp/list')
  listMcp() {
    return this.svc.listMcp();
  }

  @Post('mcp')
  saveMcp(@Body() body: any) {
    return this.svc.saveMcp(body);
  }

  @Post('mcp/:id/test')
  testMcp(@Param('id') id: string) {
    return this.svc.testMcp(Number(id));
  }

  @Delete('mcp/:id')
  deleteMcp(@Param('id') id: string) {
    return this.svc.deleteMcp(Number(id));
  }
}

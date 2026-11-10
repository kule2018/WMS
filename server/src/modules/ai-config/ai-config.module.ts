import { Module } from '@nestjs/common';
import { AiConfigController } from './ai-config.controller';
import { AiConfigService } from './ai-config.service';

/**
 * AI 配置模块。
 * 只依赖公共数据库连接池（query/tx），不引入第三方包；
 * 导出 Service 是为了让 Agent 模块在每轮对话开始时读取运行时配置。
 */
@Module({
  controllers: [AiConfigController],
  providers: [AiConfigService],
  exports: [AiConfigService],
})
export class AiConfigModule {}

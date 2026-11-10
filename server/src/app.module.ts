import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { db } from './common/db';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/jwt.guard';
import { BasicModule } from './modules/basic/basic.module';
import { InboundModule } from './modules/inbound/inbound.module';
import { OutboundModule } from './modules/outbound/outbound.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { CheckModule } from './modules/check/check.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AgentModule } from './modules/agent/agent.module';
import { SystemModule } from './modules/system/system.module';
import { AiConfigModule } from './modules/ai-config/ai-config.module';
import { ScheduledTasks } from './common/scheduled-tasks';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({
        secret: c.get('JWT_SECRET', 'wms-secret'),
        signOptions: { expiresIn: c.get('JWT_EXPIRES', '24h') },
      }),
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    BasicModule,
    InboundModule,
    OutboundModule,
    InventoryModule,
    CheckModule,
    DashboardModule,
    AgentModule,
    SystemModule,
    AiConfigModule,
    // 生产环境由后端单端口托管构建后的前端；/api 仍走业务路由
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'web', 'dist'),
      exclude: ['/api/{*path}'],
    }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard }, // 全局 JWT 校验 + 黑名单
    { provide: 'DB', useValue: db },
    ScheduledTasks,
  ],
  exports: ['DB'],
})
export class AppModule {}

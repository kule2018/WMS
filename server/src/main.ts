import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ensureExtraTables } from './common/bootstrap-sql';

async function bootstrap() {
  await ensureExtraTables();
  const app = await NestFactory.create(AppModule, { cors: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  const port = Number(process.env.PORT || 3000);
  await app.listen(port);
  console.log(`\n  WMS + 仓储多Agent 服务已启动: http://localhost:${port}/api\n`);
}
bootstrap();

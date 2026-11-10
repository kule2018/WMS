import { Module } from '@nestjs/common';
import { BasicService } from './basic.service';
import { BasicController } from './basic.controller';

@Module({ providers: [BasicService], controllers: [BasicController], exports: [BasicService] })
export class BasicModule {}

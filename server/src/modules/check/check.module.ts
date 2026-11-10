import { Module } from '@nestjs/common';
import { CheckService } from './check.service';
import { CheckController } from './check.controller';

@Module({ providers: [CheckService], controllers: [CheckController], exports: [CheckService] })
export class CheckModule {}

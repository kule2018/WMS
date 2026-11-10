import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { InboundModule } from '../inbound/inbound.module';
import { OutboundModule } from '../outbound/outbound.module';

@Module({ imports: [InventoryModule, InboundModule, OutboundModule], providers: [AgentService], controllers: [AgentController], exports: [AgentService] })
export class AgentModule {}

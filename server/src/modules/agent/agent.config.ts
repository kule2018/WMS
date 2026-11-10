import { ConfigService } from '@nestjs/config';

export const AGENT_CONFIG = 'AGENT_CONFIG';

export interface AgentConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  enabled: boolean;
}

export function loadAgentConfig(cfg: ConfigService): AgentConfig {
  const apiKey = cfg.get<string>('DEEPSEEK_API_KEY') || cfg.get<string>('OPENAI_API_KEY') || process.env.DEEPSEEK_API_KEY || '';
  return {
    apiKey,
    baseURL: cfg.get<string>('LLM_BASE_URL') || cfg.get<string>('OPENAI_BASE_URL') || process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1',
    model: cfg.get<string>('LLM_MODEL') || cfg.get<string>('OPENAI_MODEL') || process.env.LLM_MODEL || 'deepseek-chat',
    enabled: !!apiKey,
  };
}

import type {
  AiAnalysisRequest,
  AiAnalysisResponse,
  AiChatMessage,
  AiFixRequest,
  AiFixResponse,
  AiReportRequest,
  AiReportResponse,
  AiVulnerabilityRequest,
  AiVulnerabilityResponse,
} from '@veridion/shared';
import { logger } from '@veridion/logger';
import type { AiProvider } from '../ai.service';

export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';

  constructor(
    private readonly apiKey: string,
    private readonly model = 'claude-3-haiku-20240307',
  ) {}

  async analyze(_request: AiAnalysisRequest): Promise<AiAnalysisResponse> {
    logger.info({ provider: 'anthropic' }, 'Analyze not yet implemented for Anthropic');
    return {
      summary: 'Analysis via Anthropic coming soon.',
      riskScore: 0,
      recommendations: [],
      gasOptimizations: [],
      codeQualityIssues: [],
    };
  }

  async chat(messages: AiChatMessage[]): Promise<AiChatMessage> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        messages: messages.filter((m) => m.role !== 'system'),
        system: messages.find((m) => m.role === 'system')?.content,
      }),
    });

    const data = await response.json() as { content?: Array<{ text?: string }> };
    return {
      role: 'assistant',
      content: data.content?.[0]?.text ?? 'No response',
    };
  }

  async explainVulnerability(_request: AiVulnerabilityRequest): Promise<AiVulnerabilityResponse> {
    return {
      explanation: 'Anthropic vulnerability explanation coming soon.',
      impact: '',
      remediation: '',
      codeExample: '',
    };
  }

  async suggestFix(_request: AiFixRequest): Promise<AiFixResponse> {
    return {
      fixedCode: '',
      explanation: 'Anthropic fix suggestion coming soon.',
      tradeoffs: [],
    };
  }

  async generateReportSummary(_request: AiReportRequest): Promise<AiReportResponse> {
    return {
      executiveSummary: 'Anthropic report generation coming soon.',
      detailedFindings: '',
      recommendations: '',
      riskAssessment: '',
    };
  }
}

import { logger } from '@veridion/logger';
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

export interface AiProvider {
  readonly name: string;

  analyze(request: AiAnalysisRequest): Promise<AiAnalysisResponse>;
  chat(messages: AiChatMessage[]): Promise<AiChatMessage>;
  explainVulnerability(request: AiVulnerabilityRequest): Promise<AiVulnerabilityResponse>;
  suggestFix(request: AiFixRequest): Promise<AiFixResponse>;
  generateReportSummary(request: AiReportRequest): Promise<AiReportResponse>;
}

export class AiService {
  constructor(private readonly provider: AiProvider) {
    logger.info({ provider: provider.name }, 'AI service initialized');
  }

  async analyzeContract(request: AiAnalysisRequest): Promise<AiAnalysisResponse> {
    logger.info(
      { contractName: request.contractName, language: request.language },
      'Analyzing contract',
    );
    const result = await this.provider.analyze(request);
    logger.info(
      { contractName: request.contractName, riskScore: result.riskScore },
      'Analysis complete',
    );
    return result;
  }

  async chat(messages: AiChatMessage[]): Promise<AiChatMessage> {
    return this.provider.chat(messages);
  }

  async explainVulnerability(request: AiVulnerabilityRequest): Promise<AiVulnerabilityResponse> {
    logger.info({ findingType: request.findingType }, 'Explaining vulnerability');
    return this.provider.explainVulnerability(request);
  }

  async suggestFix(request: AiFixRequest): Promise<AiFixResponse> {
    logger.info(
      { vulnerability: request.vulnerability, language: request.language },
      'Suggesting fix',
    );
    return this.provider.suggestFix(request);
  }

  async generateReportSummary(request: AiReportRequest): Promise<AiReportResponse> {
    logger.info(
      { auditName: request.auditName, findingCount: request.findings.length },
      'Generating report',
    );
    return this.provider.generateReportSummary(request);
  }

  switchProvider(provider: AiProvider): void {
    logger.info({ from: this.provider.name, to: provider.name }, 'Switching AI provider');
    (this as unknown as { provider: AiProvider }).provider = provider;
  }
}

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

export interface AstContext {
  filePath: string;
  ast: string;
  imports: string[];
  functionSignatures: string[];
  variableDeclarations: string[];
}

export interface CritiqueRequest {
  originalFindings: string;
  astContext: AstContext;
  language: string;
}

export interface CritiqueResponse {
  filteredFindings: string;
  falsePositives: string[];
  confidenceScores: Record<string, number>;
  reasoning: string;
}

export interface AiProviderExtended extends AiProvider {
  critiqueFindings?(request: CritiqueRequest): Promise<CritiqueResponse>;
}

export class AiService {
  constructor(private readonly provider: AiProviderExtended) {
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

  async analyzeContractWithCritique(
    request: AiAnalysisRequest,
    astContext?: AstContext,
  ): Promise<AiAnalysisResponse> {
    logger.info(
      { contractName: request.contractName, language: request.language },
      'Starting dual-stage analysis',
    );

    // Stage 1: Initial LLM analysis
    const initialResult = await this.provider.analyze(request);
    logger.info(
      { contractName: request.contractName, riskScore: initialResult.riskScore },
      'Stage 1 analysis complete',
    );

    // Stage 2: Critique/Anti-Hallucination pass if AST context is available
    if (astContext && this.provider.critiqueFindings) {
      try {
        logger.info(
          { contractName: request.contractName },
          'Starting Stage 2: Critique/Anti-Hallucination pass',
        );

        const critiqueRequest: CritiqueRequest = {
          originalFindings: JSON.stringify(initialResult),
          astContext,
          language: request.language,
        };

        const critique = await this.provider.critiqueFindings(critiqueRequest);

        logger.info(
          {
            contractName: request.contractName,
            falsePositivesCount: critique.falsePositives.length,
          },
          'Stage 2 critique complete',
        );

        // Apply critique results to filter findings
        return this.applyCritique(initialResult, critique);
      } catch (error) {
        logger.warn(
          { contractName: request.contractName, error },
          'Critique stage failed, returning initial results',
        );
        return initialResult;
      }
    }

    return initialResult;
  }

  private applyCritique(
    initialResult: AiAnalysisResponse,
    critique: CritiqueResponse,
  ): AiAnalysisResponse {
    // Filter recommendations based on false positives
    const filteredRecommendations = initialResult.recommendations.filter(
      (rec) => !critique.falsePositives.some((fp) => rec.includes(fp)),
    );

    // Filter code quality issues
    const filteredCodeQuality = initialResult.codeQualityIssues.filter(
      (issue) => !critique.falsePositives.some((fp) => issue.includes(fp)),
    );

    // Adjust risk score based on filtered findings
    const adjustedRiskScore = this.calculateAdjustedRiskScore(
      initialResult.riskScore,
      critique.falsePositives.length,
      initialResult.recommendations.length,
    );

    return {
      ...initialResult,
      recommendations: filteredRecommendations,
      codeQualityIssues: filteredCodeQuality,
      riskScore: adjustedRiskScore,
    };
  }

  private calculateAdjustedRiskScore(
    originalScore: number,
    falsePositiveCount: number,
    totalFindings: number,
  ): number {
    if (totalFindings === 0) return originalScore;
    const falsePositiveRatio = falsePositiveCount / totalFindings;
    // Reduce risk score proportionally to false positive rate
    const adjustment = originalScore * falsePositiveRatio * 0.5;
    return Math.max(0, Math.min(100, originalScore - adjustment));
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

  switchProvider(provider: AiProviderExtended): void {
    logger.info({ from: this.provider.name, to: provider.name }, 'Switching AI provider');
    (this as unknown as { provider: AiProviderExtended }).provider = provider;
  }
}

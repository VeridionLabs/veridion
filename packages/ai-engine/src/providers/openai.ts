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

export interface OpenAiConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

interface OpenAiChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export class OpenAiProvider implements AiProvider {
  readonly name = 'openai';
  private readonly config: OpenAiConfig;

  constructor(config: OpenAiConfig) {
    this.config = {
      model: 'gpt-4-turbo',
      baseUrl: 'https://api.openai.com/v1',
      ...config,
    };
  }

  private async request<T>(body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error({ status: response.status, error }, 'OpenAI API error');
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = (await response.json()) as OpenAiChatResponse;
    const content: string = data.choices?.[0]?.message?.content ?? '';
    return JSON.parse(content) as T;
  }

  async analyze(request: AiAnalysisRequest): Promise<AiAnalysisResponse> {
    const prompt = this.buildAnalyzePrompt(request);
    const response = await this.request<AiAnalysisResponse>({
      model: this.config.model,
      messages: [
        { role: 'system', content: 'You are a smart contract security expert. Analyze the contract and output JSON.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    });
    return response;
  }

  async chat(messages: AiChatMessage[]): Promise<AiChatMessage> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
      }),
    });
    const data = (await response.json()) as OpenAiChatResponse;
    const msg = data.choices?.[0]?.message;
    return msg ? { role: 'assistant' as const, content: msg.content ?? 'No response' } : { role: 'assistant' as const, content: 'No response' };
  }

  async explainVulnerability(request: AiVulnerabilityRequest): Promise<AiVulnerabilityResponse> {
    const prompt = `Explain the following smart contract vulnerability:
Type: ${request.findingType}
Severity: ${request.severity}
Contract: ${request.contractName}
Code:
\`\`\`
${request.codeSnippet}
\`\`\`

Provide a JSON response with fields: explanation, impact, remediation, codeExample.`;

    return this.request<AiVulnerabilityResponse>({
      model: this.config.model,
      messages: [
        { role: 'system', content: 'You are a smart contract security expert. Respond in JSON.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    });
  }

  async suggestFix(request: AiFixRequest): Promise<AiFixResponse> {
    const prompt = `Suggest a fix for this vulnerability in ${request.language}:
Vulnerability: ${request.vulnerability}
Code:
\`\`\`
${request.codeSnippet}
\`\`\`

Provide JSON with fields: fixedCode, explanation, tradeoffs (array of strings).`;

    return this.request<AiFixResponse>({
      model: this.config.model,
      messages: [
        { role: 'system', content: 'You are a smart contract security expert. Respond in JSON.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    });
  }

  async generateReportSummary(request: AiReportRequest): Promise<AiReportResponse> {
    const prompt = `Generate an audit report summary:
Audit: ${request.auditName}
Project: ${request.projectName}
Security Score: ${request.securityScore}/100
Findings:
${request.findings}

Provide JSON with fields: executiveSummary, detailedFindings, recommendations, riskAssessment.`;

    return this.request<AiReportResponse>({
      model: this.config.model,
      messages: [
        { role: 'system', content: 'You are a smart contract security auditor. Respond in JSON.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    });
  }

  private buildAnalyzePrompt(request: AiAnalysisRequest): string {
    let prompt = `Analyze the following ${request.language} smart contract for security vulnerabilities, gas optimizations, and code quality issues.

Contract Name: ${request.contractName}
Language: ${request.language}

Source Code:
\`\`\`${request.language}
${request.contractCode}
\`\`\``;

    if (request.findings) {
      prompt += `\n\nAlso consider these pre-existing findings:\n${request.findings}`;
    }

    prompt += `\n\nProvide a JSON response with fields: summary, riskScore (0-100), recommendations (string array), gasOptimizations (string array), codeQualityIssues (string array).`;

    return prompt;
  }
}

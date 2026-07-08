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

import type { AiProvider } from '../ai.service';

interface AnthropicApiResponse {
  content?: Array<{ type: string; text?: string }>;
  error?: { type: string; message: string };
}

export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  private readonly baseUrl = 'https://api.anthropic.com/v1/messages';
  private readonly apiVersion = '2023-06-01';

  constructor(
    private readonly apiKey: string,
    private readonly model = 'claude-3-haiku-20240307',
  ) {}

  // ---- Public API ----

  async analyze(request: AiAnalysisRequest): Promise<AiAnalysisResponse> {
    const prompt = this.buildAnalyzePrompt(request);
    logger.info(
      { provider: 'anthropic', contractName: request.contractName },
      'Analyzing contract',
    );

    const result = await this.requestJson<AiAnalysisResponse>(
      'You are a smart contract security expert. Analyze the contract and output ONLY valid JSON — no markdown, no explanation outside the JSON object.',
      prompt,
    );

    logger.info(
      { provider: 'anthropic', contractName: request.contractName, riskScore: result.riskScore },
      'Analysis complete',
    );
    return result;
  }

  async chat(messages: AiChatMessage[]): Promise<AiChatMessage> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': this.apiVersion,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        messages: messages.filter((m) => m.role !== 'system'),
        system: messages.find((m) => m.role === 'system')?.content,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        { provider: 'anthropic', status: response.status, error: errorText },
        'Anthropic chat API error',
      );
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = (await response.json()) as AnthropicApiResponse;
    return {
      role: 'assistant',
      content: data.content?.[0]?.text ?? 'No response',
    };
  }

  async explainVulnerability(request: AiVulnerabilityRequest): Promise<AiVulnerabilityResponse> {
    logger.info(
      { provider: 'anthropic', findingType: request.findingType },
      'Explaining vulnerability',
    );

    const prompt = `Explain the following smart contract vulnerability in detail:

**Type:** ${request.findingType}
**Severity:** ${request.severity}
**Contract:** ${request.contractName}

**Code:**
\`\`\`solidity
${request.codeSnippet}
\`\`\`

Output ONLY valid JSON (no markdown fences) with these exact fields:
- explanation: A thorough explanation of what the vulnerability is and how it works
- impact: The potential consequences if exploited (financial loss, data corruption, etc.)
- remediation: Step-by-step guidance on how to fix the vulnerability
- codeExample: A concrete Solidity code example showing the secure implementation`;

    return this.requestJson<AiVulnerabilityResponse>(
      'You are a senior smart contract security auditor. You explain vulnerabilities clearly and provide actionable remediation. Output ONLY valid JSON.',
      prompt,
    );
  }

  async suggestFix(request: AiFixRequest): Promise<AiFixResponse> {
    logger.info(
      { provider: 'anthropic', vulnerability: request.vulnerability, language: request.language },
      'Suggesting fix',
    );

    const prompt = `Suggest a secure fix for the following vulnerability in ${request.language}:

**Vulnerability:** ${request.vulnerability}

**Current Code:**
\`\`\`${request.language}
${request.codeSnippet}
\`\`\`

Output ONLY valid JSON (no markdown fences) with these exact fields:
- fixedCode: The corrected code with the vulnerability patched
- explanation: A clear explanation of what was changed and why
- tradeoffs: An array of strings describing any tradeoffs or considerations with this fix`;

    return this.requestJson<AiFixResponse>(
      'You are a senior smart contract security expert. You suggest secure, production-ready fixes. Output ONLY valid JSON.',
      prompt,
    );
  }

  async generateReportSummary(request: AiReportRequest): Promise<AiReportResponse> {
    logger.info(
      { provider: 'anthropic', auditName: request.auditName },
      'Generating report summary',
    );

    const prompt = `Generate a professional audit report summary for the following smart contract security audit:

**Audit:** ${request.auditName}
**Project:** ${request.projectName}
**Security Score:** ${request.securityScore}/100

**Findings:**
${request.findings}

Output ONLY valid JSON (no markdown fences) with these exact fields:
- executiveSummary: A concise 2-3 paragraph executive summary of the audit results
- detailedFindings: A detailed breakdown of each finding category and its implications
- recommendations: Prioritized, actionable recommendations for the development team
- riskAssessment: An overall risk assessment considering likelihood and impact`;

    return this.requestJson<AiReportResponse>(
      'You are a professional smart contract security auditor writing an audit report. Be thorough, objective, and actionable. Output ONLY valid JSON.',
      prompt,
    );
  }

  // ---- Private helpers ----

  private async requestJson<T>(
    systemPrompt: string,
    userMessage: string,
    maxTokens = 4096,
  ): Promise<T> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': this.apiVersion,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        { provider: 'anthropic', status: response.status, error: errorText },
        'Anthropic API error',
      );
      throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as AnthropicApiResponse;

    if (data.error) {
      logger.error(
        { provider: 'anthropic', errorType: data.error.type, message: data.error.message },
        'Anthropic API returned an error',
      );
      throw new Error(`Anthropic API error: ${data.error.type} - ${data.error.message}`);
    }

    const rawContent = data.content?.[0]?.text ?? '';

    // Extract JSON from the response — handle markdown code fences gracefully
    const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const jsonString = jsonMatch ? jsonMatch[1]!.trim() : rawContent.trim();

    try {
      return JSON.parse(jsonString) as T;
    } catch (parseError) {
      logger.error(
        { provider: 'anthropic', rawContent: rawContent.slice(0, 500), parseError },
        'Failed to parse JSON from Anthropic response',
      );
      throw new Error(
        `Failed to parse JSON response from Anthropic. Raw content preview: ${rawContent.slice(0, 200)}`,
      );
    }
  }

  private buildAnalyzePrompt(request: AiAnalysisRequest): string {
    let prompt = `Analyze the following ${request.language} smart contract for security vulnerabilities, gas optimizations, and code quality issues.

**Contract Name:** ${request.contractName}
**Language:** ${request.language}

**Source Code:**
\`\`\`${request.language}
${request.contractCode}
\`\`\``;

    if (request.findings) {
      prompt += `\n\nAlso consider these pre-existing findings:\n${request.findings}`;
    }

    prompt += `\n\nOutput ONLY valid JSON (no markdown fences) with these exact fields:
- summary: A concise summary of the analysis
- riskScore: A number from 0 to 100 representing the security risk (0 = completely safe, 100 = extremely vulnerable)
- recommendations: An array of strings with prioritized security recommendations
- gasOptimizations: An array of strings with gas-saving suggestions
- codeQualityIssues: An array of strings with code quality improvements`;

    return prompt;
  }
}

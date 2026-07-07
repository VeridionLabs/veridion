import { describe, it, expect } from 'vitest';
import { AiService } from './ai.service';
import type { AiProvider } from './ai.service';

const mockProvider: AiProvider = {
  name: 'mock',
  analyze: async () => ({ summary: 'OK', riskScore: 50, recommendations: [], gasOptimizations: [], codeQualityIssues: [] }),
  chat: async () => ({ role: 'assistant', content: 'Hello' }),
  explainVulnerability: async () => ({ explanation: 'Test', impact: '', remediation: '', codeExample: '' }),
  suggestFix: async () => ({ fixedCode: '// fixed', explanation: '', tradeoffs: [] }),
  generateReportSummary: async () => ({ executiveSummary: 'Summary', detailedFindings: '', recommendations: '', riskAssessment: '' }),
};

describe('AiService', () => {
  it('should initialize with a provider', () => {
    const service = new AiService(mockProvider);
    expect(service).toBeDefined();
  });

  it('should analyze a contract', async () => {
    const service = new AiService(mockProvider);
    const result = await service.analyzeContract({
      contractCode: 'contract Test {}',
      contractName: 'Test',
      language: 'solidity',
    });
    expect(result.riskScore).toBe(50);
  });

  it('should switch providers', () => {
    const service = new AiService(mockProvider);
    const newProvider: AiProvider = { ...mockProvider, name: 'new-provider' };
    service.switchProvider(newProvider);
    // No error means success
  });
});

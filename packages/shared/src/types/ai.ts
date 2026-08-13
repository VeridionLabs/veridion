export interface AiProvider {
  name: string;
  analyze(request: AiAnalysisRequest): Promise<AiAnalysisResponse>;
  chat(request: AiChatMessage[]): Promise<AiChatMessage>;
  explainVulnerability(finding: AiVulnerabilityRequest): Promise<AiVulnerabilityResponse>;
  suggestFix(codeContext: AiFixRequest): Promise<AiFixResponse>;
  generateReportSummary(findings: AiReportRequest): Promise<AiReportResponse>;
}

export interface AiAnalysisRequest {
  contractCode: string;
  contractName: string;
  language: string;
  findings?: string;
}

export interface AiAnalysisResponse {
  summary: string;
  riskScore: number;
  recommendations: string[];
  gasOptimizations: string[];
  codeQualityIssues: string[];
}

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiVulnerabilityRequest {
  findingType: string;
  severity: string;
  codeSnippet: string;
  contractName: string;
}

export interface AiVulnerabilityResponse {
  explanation: string;
  impact: string;
  remediation: string;
  codeExample: string;
}

export interface AiFixRequest {
  codeSnippet: string;
  vulnerability: string;
  language: string;
}

export interface AiFixResponse {
  fixedCode: string;
  explanation: string;
  tradeoffs: string[];
}

export interface AiReportRequest {
  auditName: string;
  projectName: string;
  findings: string;
  securityScore: number;
}

export interface AiReportResponse {
  executiveSummary: string;
  detailedFindings: string;
  recommendations: string;
  riskAssessment: string;
}

import type { FindingResult } from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';

export interface FindingSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  gas: number;
  informational: number;
  total: number;
}

export class ResultAggregator {
  summarize(findings: FindingResult[]): FindingSummary {
    return {
      critical: this.countBySeverity(findings, FindingSeverity.CRITICAL),
      high: this.countBySeverity(findings, FindingSeverity.HIGH),
      medium: this.countBySeverity(findings, FindingSeverity.MEDIUM),
      low: this.countBySeverity(findings, FindingSeverity.LOW),
      gas: this.countBySeverity(findings, FindingSeverity.GAS),
      informational: this.countBySeverity(findings, FindingSeverity.INFORMATIONAL),
      total: findings.length,
    };
  }

  calculateScore(findings: FindingResult[]): number {
    if (findings.length === 0) return 100;

    const weights: Record<string, number> = {
      CRITICAL: 10,
      HIGH: 7,
      MEDIUM: 4,
      LOW: 2,
      GAS: 1,
      INFORMATIONAL: 0,
    };

    let totalWeight = 0;
    let maxPossible = 0;

    for (const finding of findings) {
      const weight = weights[finding.severity] ?? 0;
      totalWeight += weight * finding.confidence;
      maxPossible += 10;
    }

    const score = 100 - (totalWeight / maxPossible) * 100;
    return Math.max(0, Math.round(score));
  }

  groupByPlugin(findings: FindingResult[]): Map<string, FindingResult[]> {
    const grouped = new Map<string, FindingResult[]>();
    for (const finding of findings) {
      const existing = grouped.get(finding.pluginId) ?? [];
      existing.push(finding);
      grouped.set(finding.pluginId, existing);
    }
    return grouped;
  }

  groupBySeverity(findings: FindingResult[]): Map<string, FindingResult[]> {
    const grouped = new Map<string, FindingResult[]>();
    for (const finding of findings) {
      const existing = grouped.get(finding.severity) ?? [];
      existing.push(finding);
      grouped.set(finding.severity, existing);
    }
    return grouped;
  }

  private countBySeverity(findings: FindingResult[], severity: FindingSeverity): number {
    return findings.filter((f) => f.severity === severity).length;
  }
}

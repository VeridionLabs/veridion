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

const SEVERITY_RANK: Record<FindingSeverity, number> = {
  [FindingSeverity.CRITICAL]: 5,
  [FindingSeverity.HIGH]: 4,
  [FindingSeverity.MEDIUM]: 3,
  [FindingSeverity.LOW]: 2,
  [FindingSeverity.GAS]: 1,
  [FindingSeverity.INFORMATIONAL]: 0,
};

export class ResultAggregator {
  deduplicateFindings(findings: FindingResult[]): FindingResult[] {
    const map = new Map<string, FindingResult>();

    for (const finding of findings) {
      const category =
        (finding as FindingResult & { category?: string }).category ?? finding.pluginId;
      const key = `${finding.filePath}:${finding.lineStart}:${finding.lineEnd}:${category}`;

      const existing = map.get(key);
      if (!existing) {
        map.set(key, finding);
        continue;
      }

      const existingRank = SEVERITY_RANK[existing.severity] ?? -1;
      const newRank = SEVERITY_RANK[finding.severity] ?? -1;

      if (newRank > existingRank) {
        map.set(key, finding);
      } else if (newRank === existingRank && finding.confidence > existing.confidence) {
        map.set(key, finding);
      }
    }

    return Array.from(map.values());
  }

  summarize(findings: FindingResult[]): FindingSummary {
    const deduped = this.deduplicateFindings(findings);
    return {
      critical: this.countBySeverity(deduped, FindingSeverity.CRITICAL),
      high: this.countBySeverity(deduped, FindingSeverity.HIGH),
      medium: this.countBySeverity(deduped, FindingSeverity.MEDIUM),
      low: this.countBySeverity(deduped, FindingSeverity.LOW),
      gas: this.countBySeverity(deduped, FindingSeverity.GAS),
      informational: this.countBySeverity(deduped, FindingSeverity.INFORMATIONAL),
      total: deduped.length,
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

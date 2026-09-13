import type { FindingResult } from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { ResultAggregator } from './result-aggregator';

function createMockFinding(overrides: Partial<FindingResult> & { category?: string } = {}): FindingResult {
  return {
    pluginId: 'reentrancy',
    title: 'Potential Vulnerability',
    description: 'A mock vulnerability description',
    severity: FindingSeverity.MEDIUM,
    filePath: 'contracts/Token.sol',
    lineStart: 10,
    lineEnd: 15,
    codeSnippet: 'msg.sender.call{value: amount}("");',
    recommendation: 'Fix the vulnerability',
    confidence: 0.8,
    references: ['https://swcregistry.io/docs/SWC-107'],
    ...overrides,
  };
}

describe('ResultAggregator', () => {
  let aggregator: ResultAggregator;

  beforeEach(() => {
    aggregator = new ResultAggregator();
  });

  describe('deduplicateFindings', () => {
    it('should return an empty array when given no findings', () => {
      expect(aggregator.deduplicateFindings([])).toEqual([]);
    });

    it('should return the single finding when only one is provided', () => {
      const finding = createMockFinding();
      expect(aggregator.deduplicateFindings([finding])).toEqual([finding]);
    });

    it('should deduplicate findings at the same file, line range, and category with same severity', () => {
      const finding1 = createMockFinding({
        pluginId: 'plugin-a',
        confidence: 0.8,
        description: 'First report',
      });
      const finding2 = createMockFinding({
        pluginId: 'plugin-b',
        confidence: 0.8,
        description: 'Second report',
      });

      const result = aggregator.deduplicateFindings([
        { ...finding1, category: 'REENTRANCY' },
        { ...finding2, category: 'REENTRANCY' },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]?.description).toBe('First report');
    });

    it('should keep higher confidence finding when severities are identical', () => {
      const lowerConfidence = createMockFinding({
        pluginId: 'plugin-a',
        confidence: 0.6,
        description: 'Lower confidence',
      });
      const higherConfidence = createMockFinding({
        pluginId: 'plugin-b',
        confidence: 0.95,
        description: 'Higher confidence',
      });

      const result = aggregator.deduplicateFindings([
        { ...lowerConfidence, category: 'REENTRANCY' },
        { ...higherConfidence, category: 'REENTRANCY' },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]?.confidence).toBe(0.95);
      expect(result[0]?.description).toBe('Higher confidence');
    });

    it('should keep higher-severity finding when duplicates exist with different severities', () => {
      const lowFinding = createMockFinding({
        pluginId: 'plugin-low',
        severity: FindingSeverity.LOW,
        description: 'Low severity detection',
      });
      const criticalFinding = createMockFinding({
        pluginId: 'plugin-crit',
        severity: FindingSeverity.CRITICAL,
        description: 'Critical severity detection',
      });

      const result1 = aggregator.deduplicateFindings([
        { ...lowFinding, category: 'REENTRANCY' },
        { ...criticalFinding, category: 'REENTRANCY' },
      ]);

      expect(result1).toHaveLength(1);
      expect(result1[0]?.severity).toBe(FindingSeverity.CRITICAL);
      expect(result1[0]?.description).toBe('Critical severity detection');

      const result2 = aggregator.deduplicateFindings([
        { ...criticalFinding, category: 'REENTRANCY' },
        { ...lowFinding, category: 'REENTRANCY' },
      ]);

      expect(result2).toHaveLength(1);
      expect(result2[0]?.severity).toBe(FindingSeverity.CRITICAL);
    });

    it('should correctly prioritize across all severity levels', () => {
      const severities = [
        FindingSeverity.INFORMATIONAL,
        FindingSeverity.GAS,
        FindingSeverity.LOW,
        FindingSeverity.MEDIUM,
        FindingSeverity.HIGH,
        FindingSeverity.CRITICAL,
      ];

      for (let i = 0; i < severities.length - 1; i++) {
        const lower = severities[i];
        const higher = severities[i + 1];
        if (!lower || !higher) continue;

        const fLower = createMockFinding({ severity: lower });
        const fHigher = createMockFinding({ severity: higher });

        const result = aggregator.deduplicateFindings([
          { ...fLower, category: 'CUSTOM' },
          { ...fHigher, category: 'CUSTOM' },
        ]);

        expect(result).toHaveLength(1);
        expect(result[0]?.severity).toBe(higher);
      }
    });

    it('should not deduplicate findings with different file paths', () => {
      const findingA = createMockFinding({ filePath: 'contracts/A.sol' });
      const findingB = createMockFinding({ filePath: 'contracts/B.sol' });

      const result = aggregator.deduplicateFindings([findingA, findingB]);
      expect(result).toHaveLength(2);
    });

    it('should not deduplicate findings with different line ranges', () => {
      const findingA = createMockFinding({ lineStart: 10, lineEnd: 15 });
      const findingB = createMockFinding({ lineStart: 20, lineEnd: 25 });

      const result = aggregator.deduplicateFindings([findingA, findingB]);
      expect(result).toHaveLength(2);
    });

    it('should not deduplicate findings with different categories at the same location', () => {
      const reentrancy = createMockFinding({
        pluginId: 'reentrancy',
      });
      const accessControl = createMockFinding({
        pluginId: 'access-control',
      });

      const result = aggregator.deduplicateFindings([
        { ...reentrancy, category: 'REENTRANCY' },
        { ...accessControl, category: 'ACCESS_CONTROL' },
      ]);

      expect(result).toHaveLength(2);
    });

    it('should fallback to pluginId as category when category is not explicitly provided', () => {
      const finding1 = createMockFinding({ pluginId: 'detector-1' });
      const finding2 = createMockFinding({ pluginId: 'detector-2' });

      const result = aggregator.deduplicateFindings([finding1, finding2]);
      expect(result).toHaveLength(2);
    });
  });

  describe('summarize', () => {
    it('should reflect deduplicated results in summary counts', () => {
      const duplicateLow = createMockFinding({
        filePath: 'contracts/Vault.sol',
        lineStart: 50,
        lineEnd: 55,
        severity: FindingSeverity.LOW,
      });
      const duplicateHigh = createMockFinding({
        filePath: 'contracts/Vault.sol',
        lineStart: 50,
        lineEnd: 55,
        severity: FindingSeverity.HIGH,
      });
      const uniqueGas = createMockFinding({
        filePath: 'contracts/Vault.sol',
        lineStart: 80,
        lineEnd: 82,
        severity: FindingSeverity.GAS,
      });

      const findings = [
        { ...duplicateLow, category: 'REENTRANCY' },
        { ...duplicateHigh, category: 'REENTRANCY' },
        { ...uniqueGas, category: 'GAS' },
      ];

      const summary = aggregator.summarize(findings);

      expect(summary.total).toBe(2);
      expect(summary.high).toBe(1);
      expect(summary.low).toBe(0);
      expect(summary.gas).toBe(1);
      expect(summary.critical).toBe(0);
      expect(summary.medium).toBe(0);
      expect(summary.informational).toBe(0);
    });

    it('should correctly summarize empty findings', () => {
      const summary = aggregator.summarize([]);
      expect(summary.total).toBe(0);
      expect(summary.critical).toBe(0);
      expect(summary.high).toBe(0);
      expect(summary.medium).toBe(0);
      expect(summary.low).toBe(0);
      expect(summary.gas).toBe(0);
      expect(summary.informational).toBe(0);
    });
  });

  describe('calculateScore', () => {
    it('should return 100 for empty findings', () => {
      expect(aggregator.calculateScore([])).toBe(100);
    });

    it('should calculate score based on findings and confidence', () => {
      const findings = [
        createMockFinding({ severity: FindingSeverity.CRITICAL, confidence: 1.0 }),
      ];
      const score = aggregator.calculateScore(findings);
      expect(score).toBe(0);
    });
  });

  describe('groupByPlugin and groupBySeverity', () => {
    it('should group findings by plugin', () => {
      const f1 = createMockFinding({ pluginId: 'plugin-1' });
      const f2 = createMockFinding({ pluginId: 'plugin-2' });
      const f3 = createMockFinding({ pluginId: 'plugin-1' });

      const grouped = aggregator.groupByPlugin([f1, f2, f3]);
      expect(grouped.get('plugin-1')).toHaveLength(2);
      expect(grouped.get('plugin-2')).toHaveLength(1);
    });

    it('should group findings by severity', () => {
      const f1 = createMockFinding({ severity: FindingSeverity.CRITICAL });
      const f2 = createMockFinding({ severity: FindingSeverity.LOW });
      const f3 = createMockFinding({ severity: FindingSeverity.CRITICAL });

      const grouped = aggregator.groupBySeverity([f1, f2, f3]);
      expect(grouped.get(FindingSeverity.CRITICAL)).toHaveLength(2);
      expect(grouped.get(FindingSeverity.LOW)).toHaveLength(1);
    });
  });
});

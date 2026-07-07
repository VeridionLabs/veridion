import { SEVERITY_WEIGHTS } from '../constants';
import type { FindingSeverity } from '../enums';

export function calculateScore(findings: Array<{ severity: FindingSeverity }>): number {
  if (findings.length === 0) return 100;

  let totalWeight = 0;
  let maxPossibleWeight = 0;

  for (const finding of findings) {
    const weight = SEVERITY_WEIGHTS[finding.severity] ?? 0;
    totalWeight += weight;
    maxPossibleWeight += 10;
  }

  const score = 100 - (totalWeight / maxPossibleWeight) * 100;
  return Math.max(0, Math.round(score));
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

export function formatAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce(
    (acc, item) => {
      const groupKey = String(item[key]);
      if (!acc[groupKey]) acc[groupKey] = [];
      acc[groupKey]!.push(item);
      return acc;
    },
    {} as Record<string, T[]>,
  );
}

export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export function parseJsonSafe<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

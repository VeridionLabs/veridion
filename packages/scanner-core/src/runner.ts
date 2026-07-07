import type { AnalysisContext } from '@veridion/scanner-types';
import { AuditStatus } from '@veridion/shared';
import { logger } from '@veridion/logger';

import type { ScanResult, ScannerConfig } from './scanner';
import { Scanner } from './scanner';
import type { PluginRegistry } from './plugin-registry';

export interface ScanJob {
  id: string;
  context: AnalysisContext;
  config?: ScannerConfig;
}

export interface ScanJobResult {
  jobId: string;
  result: ScanResult;
}

export class ScanRunner {
  private readonly scanner: Scanner;

  constructor(
    registry: PluginRegistry,
    private readonly defaultConfig?: ScannerConfig,
  ) {
    this.scanner = new Scanner(registry, defaultConfig);
  }

  async runJob(job: ScanJob): Promise<ScanJobResult> {
    logger.info({ jobId: job.id }, 'Starting scan job');

    try {
      const result = await this.scanner.scan(job.context);

      logger.info(
        { jobId: job.id, findingCount: result.findings.length, durationMs: result.durationMs },
        'Scan job completed',
      );

      return { jobId: job.id, result };
    } catch (error) {
      logger.error({ jobId: job.id, error }, 'Scan job failed');

      return {
        jobId: job.id,
        result: {
          status: AuditStatus.FAILED,
          findings: [],
          durationMs: 0,
          pluginCount: 0,
          summary: {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            gas: 0,
            informational: 0,
            total: 0,
          },
        },
      };
    }
  }

  async runBatch(jobs: ScanJob[]): Promise<ScanJobResult[]> {
    logger.info({ jobCount: jobs.length }, 'Starting batch scan');
    const results = await Promise.all(jobs.map((job) => this.runJob(job)));
    logger.info({ completedCount: results.length }, 'Batch scan completed');
    return results;
  }
}

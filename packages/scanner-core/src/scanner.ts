import { logger } from '@veridion/logger';
import type { AnalysisContext, FindingResult, IRulePlugin } from '@veridion/scanner-types';
import { AuditStatus, type FindingSeverity } from '@veridion/shared';

import type { PluginRegistry } from './plugin-registry';
import { ResultAggregator } from './result-aggregator';

export interface ScannerConfig {
  parallel?: boolean;
  timeout?: number;
  maxFindings?: number;
}

export interface ScanResult {
  status: AuditStatus;
  findings: FindingResult[];
  durationMs: number;
  pluginCount: number;
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    gas: number;
    informational: number;
    total: number;
  };
}

export class Scanner {
  private readonly aggregator: ResultAggregator;

  constructor(
    private readonly registry: PluginRegistry,
    private readonly config: ScannerConfig = {},
  ) {
    this.aggregator = new ResultAggregator();
  }

  async scan(context: AnalysisContext): Promise<ScanResult> {
    const startTime = Date.now();
    const plugins = this.registry.getMatchingPlugins(context);

    logger.info(
      {
        contractName: context.contractName,
        chain: context.chain,
        language: context.language,
        pluginCount: plugins.length,
      },
      'Starting scan',
    );

    let allFindings: FindingResult[];

    if (this.config.parallel) {
      const results = await Promise.allSettled(
        plugins.map((plugin) => this.runPlugin(plugin, context)),
      );
      allFindings = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    } else {
      allFindings = [];
      for (const plugin of plugins) {
        const findings = await this.runPlugin(plugin, context);
        allFindings.push(...findings);
      }
    }

    const durationMs = Date.now() - startTime;
    const summary = this.aggregator.summarize(allFindings);

    logger.info(
      {
        contractName: context.contractName,
        durationMs,
        totalFindings: allFindings.length,
        summary,
      },
      'Scan completed',
    );

    return {
      status: AuditStatus.COMPLETED,
      findings: allFindings,
      durationMs,
      pluginCount: plugins.length,
      summary,
    };
  }

  private async runPlugin(plugin: IRulePlugin, context: AnalysisContext): Promise<FindingResult[]> {
    try {
      const config = this.registry.getPluginConfig(plugin.metadata.id);
      if (config?.enabled === false) {
        logger.debug({ pluginId: plugin.metadata.id }, 'Plugin disabled by configuration, skipping');
        return [];
      }

      logger.debug({ pluginId: plugin.metadata.id }, 'Running plugin');
      let findings = await plugin.analyze(context);

      if (config) {
        if (config.disabledPatterns && config.disabledPatterns.length > 0) {
          findings = findings.filter((f) => {
            const matchesPattern = config.disabledPatterns?.some(
              (pattern) =>
                f.title.toLowerCase().includes(pattern.toLowerCase()) ||
                f.codeSnippet.toLowerCase().includes(pattern.toLowerCase()),
            );
            return !matchesPattern;
          });
        }

        if (config.severityOverride) {
          findings = findings.map((f) => ({
            ...f,
            severity: config.severityOverride as FindingSeverity,
          }));
        }
      }

      logger.debug(
        { pluginId: plugin.metadata.id, findingCount: findings.length },
        'Plugin completed',
      );
      return findings;
    } catch (error) {
      logger.error({ pluginId: plugin.metadata.id, error }, 'Plugin failed');
      return [];
    }
  }
}

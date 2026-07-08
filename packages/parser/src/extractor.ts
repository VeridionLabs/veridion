import { logger } from '@veridion/logger';

export interface ExtractedContract {
  name: string;
  path: string;
  source: string;
  language: string;
}

export class ContractExtractor {
  extractFromBlob(content: string, language = 'solidity'): ExtractedContract[] {
    logger.info({ language, contentLength: content.length }, 'Extracting contracts');
    return this.splitContracts(content, language);
  }

  private splitContracts(content: string, language: string): ExtractedContract[] {
    if (language === 'solidity') {
      return this.extractSolidityContracts(content);
    }
    return [
      {
        name: 'main',
        path: 'contract.sol',
        source: content,
        language,
      },
    ];
  }

  private extractSolidityContracts(content: string): ExtractedContract[] {
    const contracts: ExtractedContract[] = [];
    const contractRegex = /(?:abstract\s+)?(?:contract|interface|library)\s+(\w+)[^{]*\{/g;
    let match;

    while ((match = contractRegex.exec(content)) !== null) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const name = match[1]!;
      const startIdx = match.index;

      let braceCount = 0;
      let endIdx = startIdx;

      for (let i = startIdx; i < content.length; i++) {
        if (content[i] === '{') braceCount++;
        if (content[i] === '}') {
          braceCount--;
          if (braceCount === 0) {
            endIdx = i + 1;
            break;
          }
        }
      }

      contracts.push({
        name,
        path: `${name}.sol`,
        source: content.slice(startIdx, endIdx),
        language: 'solidity',
      });
    }

    if (contracts.length === 0) {
      contracts.push({
        name: 'Contract',
        path: 'Contract.sol',
        source: content,
        language: 'solidity',
      });
    }

    return contracts;
  }
}

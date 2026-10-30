import type { AnalysisContext } from '@veridion/scanner-types';
import { describe, expect, it } from 'vitest';

import { TimestampPlugin } from './index';

describe('TimestampPlugin', () => {
  const plugin = new TimestampPlugin();

  const createContext = (sourceCode: string): AnalysisContext => ({
    contractName: 'Test',
    sourceCode,
    chain: 'ethereum',
    language: 'solidity',
    compilerVersion: '0.8.19',
    metadata: {},
  });

  describe('metadata', () => {
    it('should have correct metadata', () => {
      expect(plugin.metadata.id).toBe('timestamp');
      expect(plugin.metadata.name).toBe('Timestamp Dependence Detector');
      expect(plugin.metadata.version).toBe('1.0.0');
      expect(plugin.metadata.severity).toBe('LOW');
      expect(plugin.metadata.category).toBe('TIMESTAMP');
      expect(plugin.metadata.languages).toContain('solidity');
      expect(plugin.metadata.tags).toContain('timestamp');
    });

    it('should have references defined', () => {
      expect(plugin.metadata.references?.length).toBeGreaterThan(0);
    });
  });

  describe('supportsContext', () => {
    it('should support solidity on ethereum', () => {
      expect(plugin.supportsContext(createContext(''))).toBe(true);
    });

    it('should support other configured chains', () => {
      expect(plugin.supportsContext({ ...createContext(''), chain: 'polygon' })).toBe(true);
    });

    it('should not support unsupported chains', () => {
      expect(plugin.supportsContext({ ...createContext(''), chain: 'solana' })).toBe(false);
    });

    it('should not support unsupported languages', () => {
      expect(plugin.supportsContext({ ...createContext(''), language: 'vyper' })).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should resolve without configuration', async () => {
      await expect(plugin.initialize()).resolves.toBeUndefined();
    });

    it('should accept an optional config object', async () => {
      await expect(plugin.initialize({ strict: true })).resolves.toBeUndefined();
    });
  });

  describe('detection: block.timestamp in conditional logic', () => {
    it('should detect block.timestamp inside an if condition', async () => {
      const code = `
pragma solidity ^0.8.0;
contract Vulnerable {
    function f() external view returns (bool) {
        if (block.timestamp > deadline) {
            return true;
        }
        return false;
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings.length).toBe(1);
      expect(findings[0]?.title).toContain('Timestamp Dependence');
      expect(findings[0]?.severity).toBe('LOW');
      expect(findings[0]?.pluginId).toBe('timestamp');
      expect(findings[0]?.filePath).toBe('Test.sol');
      expect(findings[0]?.lineStart).toBe(5);
      expect(findings[0]?.lineEnd).toBe(5);
      expect(findings[0]?.codeSnippet).toContain('block.timestamp');
      expect(findings[0]?.confidence).toBeGreaterThan(0.8);
      expect(findings[0]?.references.length).toBeGreaterThan(0);
    });

    it('should detect block.timestamp inside require', async () => {
      const code = `
pragma solidity ^0.8.0;
contract V {
    function f() external view {
        require(block.timestamp <= deadline, "too late");
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings.length).toBe(1);
      expect(findings[0]?.title).toContain('Timestamp Dependence');
    });

    it('should detect block.timestamp inside assert', async () => {
      const code = `
pragma solidity ^0.8.0;
contract V {
    function f() external view {
        assert(block.timestamp < end);
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings.length).toBe(1);
    });

    it('should detect block.timestamp inside a while loop condition', async () => {
      const code = `
pragma solidity ^0.8.0;
contract V {
    function f() external view {
        while (block.timestamp < end) {
            break;
        }
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings.length).toBe(1);
    });

    it('should detect block.timestamp in a ternary expression', async () => {
      const code = `
pragma solidity ^0.8.0;
contract V {
    function f() external view returns (uint256) {
        uint256 fee = block.timestamp > deadline ? 2 : 1;
        return fee;
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings.length).toBe(1);
      expect(findings[0]?.title).toContain('Timestamp Dependence');
    });

    it('should detect block.timestamp in a multi-line condition', async () => {
      const code = `
pragma solidity ^0.8.0;
contract V {
    function f() external view returns (bool) {
        if (
            block.timestamp > deadline
        ) {
            return true;
        }
        return false;
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings.length).toBe(1);
      expect(findings[0]?.lineStart).toBe(6);
    });

    it('should tolerate whitespace around the member access', async () => {
      const code = `
pragma solidity ^0.8.0;
contract V {
    function f() external view returns (bool) {
        if (block . timestamp > deadline) {
            return true;
        }
        return false;
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings.length).toBe(1);
    });

    it('should report one finding per line when the condition repeats it', async () => {
      const code = `
pragma solidity ^0.8.0;
contract V {
    function f() external view returns (bool) {
        if (block.timestamp >= start && block.timestamp <= end) {
            return true;
        }
        return false;
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings.length).toBe(1);
      expect(findings[0]?.lineStart).toBe(5);
    });
  });

  describe('detection: negative cases', () => {
    it('should not flag block.timestamp used outside a condition', async () => {
      const code = `
pragma solidity ^0.8.0;
contract Safe {
    function f() external view returns (uint256) {
        uint256 snapshot = block.timestamp;
        return snapshot;
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings).toEqual([]);
    });

    it('should not flag block.number', async () => {
      const code = `
pragma solidity ^0.8.0;
contract Safe {
    function f() external view returns (bool) {
        return block.number > deadline;
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings).toEqual([]);
    });

    it('should ignore block.timestamp inside a line comment', async () => {
      const code = `
pragma solidity ^0.8.0;
contract Safe {
    function f() external view returns (bool) {
        // if (block.timestamp > deadline) { return true; }
        return false;
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings).toEqual([]);
    });

    it('should ignore block.timestamp inside a multi-line block comment', async () => {
      const code = `
pragma solidity ^0.8.0;
contract Safe {
    function f() external view returns (bool) {
        /*
         * if (block.timestamp > deadline) {
         *     return true;
         * }
         */
        return false;
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings).toEqual([]);
    });

    it('should ignore block.timestamp inside a string literal', async () => {
      const code = `
pragma solidity ^0.8.0;
contract Safe {
    function f() external pure returns (bool) {
        require(keccak256("block.timestamp") != bytes32(0), "x");
        return true;
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings).toEqual([]);
    });

    it('should ignore identifiers that merely contain now', async () => {
      const code = `
pragma solidity ^0.8.0;
contract Safe {
    uint256 public snow;
    uint256 public known;

    function f() external view returns (bool) {
        return snow > known;
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings).toEqual([]);
    });

    it('should ignore the now alias inside a comment', async () => {
      const code = `
pragma solidity ^0.8.0;
contract Safe {
    function f() external view returns (bool) {
        // uint256 t = now;
        return false;
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings).toEqual([]);
    });

    it('should return no findings for empty source', async () => {
      const findings = await plugin.analyze(createContext(''));

      expect(findings).toEqual([]);
    });
  });

  describe('detection: legacy now alias', () => {
    it('should detect legacy now inside a condition', async () => {
      const code = `
pragma solidity ^0.8.0;
contract Legacy {
    function f() external view returns (bool) {
        if (now > deadline) {
            return true;
        }
        return false;
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings.length).toBe(1);
      expect(findings[0]?.title).toBe('Timestamp Dependence via now');
      expect(findings[0]?.severity).toBe('LOW');
    });

    it('should detect legacy now in require', async () => {
      const code = `
pragma solidity ^0.8.0;
contract Legacy {
    function f() external view {
        require(now >= start);
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings.length).toBe(1);
      expect(findings[0]?.title).toContain('Timestamp Dependence');
    });

    it('should detect legacy now outside a condition as a deprecated alias', async () => {
      const code = `
pragma solidity ^0.8.0;
contract Legacy {
    function f() external view returns (uint256) {
        uint256 t = now;
        return t;
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings.length).toBe(1);
      expect(findings[0]?.title).toBe('Deprecated now Alias Usage');
      expect(findings[0]?.description).toContain('removed in Solidity 0.7.0');
      expect(findings[0]?.recommendation).toContain('block.timestamp');
    });

    it('should report one finding for a line using both now and block.timestamp', async () => {
      const code = `
pragma solidity ^0.8.0;
contract Legacy {
    function f() external view returns (bool) {
        if (now > start && block.timestamp < end) {
            return true;
        }
        return false;
    }
}`;

      const findings = await plugin.analyze(createContext(code));

      expect(findings.length).toBe(2);
      const titles = findings.map((f) => f.title).sort();
      expect(titles).toEqual([
        'Timestamp Dependence via block.timestamp',
        'Timestamp Dependence via now',
      ]);
    });
  });

  describe('getFixRecommendation', () => {
    it('should include the file path and line in the recommendation', async () => {
      const code = `
pragma solidity ^0.8.0;
contract V {
    function f() external view returns (bool) {
        if (block.timestamp > deadline) {
            return true;
        }
        return false;
    }
}`;

      const [finding] = await plugin.analyze(createContext(code));
      expect(finding).toBeDefined();
      if (!finding) throw new Error('expected a timestamp finding');

      const recommendation = plugin.getFixRecommendation(finding);

      expect(recommendation).toContain('Test.sol');
      expect(recommendation).toContain('5');
      expect(recommendation).toContain('block.timestamp');
      expect(recommendation.length).toBeGreaterThan(100);
    });

    it('should recommend replacing the legacy alias for non-conditional findings', async () => {
      const code = `
pragma solidity ^0.8.0;
contract Legacy {
    function f() external view returns (uint256) {
        uint256 t = now;
        return t;
    }
}`;

      const [finding] = await plugin.analyze(createContext(code));
      expect(finding?.recommendation).toContain('legacy');
    });
  });
});

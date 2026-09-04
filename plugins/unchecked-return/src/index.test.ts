import { describe, expect, it } from 'vitest';

import { UncheckedReturnPlugin } from './index';

describe('UncheckedReturnPlugin', () => {
  const plugin = new UncheckedReturnPlugin();

  it('should have correct metadata', () => {
    expect(plugin.metadata.id).toBe('unchecked-return');
    expect(plugin.metadata.severity).toBe('HIGH');
    expect(plugin.metadata.category).toBe('UNCHECKED_RETURN');
  });

  it('should support solidity on ethereum', () => {
    expect(
      plugin.supportsContext({
        contractName: 'Test',
        sourceCode: '',
        chain: 'ethereum',
        language: 'solidity',
        compilerVersion: null,
        metadata: {},
      }),
    ).toBe(true);
  });

  it('should detect unhandled .call', async () => {
    const vulnerableCode = `
contract Vulnerable {
    function withdraw(address payable target, uint amount) public {
        target.call{value: amount}("");
    }
}`;

    const findings = await plugin.analyze({
      contractName: 'Vulnerable',
      sourceCode: vulnerableCode,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.19',
      metadata: {},
    });

    expect(findings.length).toBe(1);
    expect(findings[0]?.pluginId).toBe('unchecked-return');
    expect(findings[0]?.description).toContain('.call');
  });

  it('should detect unhandled .send', async () => {
    const vulnerableCode = `
contract Vulnerable {
    function withdraw(address payable target, uint amount) public {
        target.send(amount);
    }
}`;

    const findings = await plugin.analyze({
      contractName: 'Vulnerable',
      sourceCode: vulnerableCode,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.19',
      metadata: {},
    });

    expect(findings.length).toBe(1);
    expect(findings[0]?.pluginId).toBe('unchecked-return');
    expect(findings[0]?.description).toContain('.send');
  });

  it('should not flag handled .call in require', async () => {
    const safeCode = `
contract Safe {
    function withdraw(address payable target, uint amount) public {
        (bool success, ) = target.call{value: amount}("");
        require(success, "Call failed");
    }
}`;

    const findings = await plugin.analyze({
      contractName: 'Safe',
      sourceCode: safeCode,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.19',
      metadata: {},
    });

    expect(findings.length).toBe(0);
  });

  it('should not flag handled .send in require directly', async () => {
    const safeCode = `
contract Safe {
    function withdraw(address payable target, uint amount) public {
        require(target.send(amount), "Send failed");
    }
}`;

    const findings = await plugin.analyze({
      contractName: 'Safe',
      sourceCode: safeCode,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.19',
      metadata: {},
    });

    expect(findings.length).toBe(0);
  });

  it('should not flag assigned .call', async () => {
    const safeCode = `
contract Safe {
    function withdraw(address payable target, uint amount) public returns (bool) {
        (bool success, ) = target.call{value: amount}("");
        return success;
    }
}`;

    const findings = await plugin.analyze({
      contractName: 'Safe',
      sourceCode: safeCode,
      chain: 'ethereum',
      language: 'solidity',
      compilerVersion: '0.8.19',
      metadata: {},
    });

    expect(findings.length).toBe(0);
  });
});

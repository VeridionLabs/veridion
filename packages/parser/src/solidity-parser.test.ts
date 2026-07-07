import { describe, it, expect } from 'vitest';
import { SolidityParser } from './solidity-parser';

describe('SolidityParser', () => {
  const parser = new SolidityParser();

  const simpleContract = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

contract SimpleStorage is Ownable {
    uint256 private value;
    
    event ValueChanged(uint256 newValue);
    
    modifier onlyPositive(uint256 val) {
        require(val > 0);
        _;
    }
    
    function setValue(uint256 newValue) public onlyPositive(newValue) {
        value = newValue;
        emit ValueChanged(newValue);
    }
    
    function getValue() public view returns (uint256) {
        return value;
    }
}
`;

  it('should parse contract name', () => {
    const result = parser.parse(simpleContract, 'SimpleStorage');
    expect(result.name).toBe('SimpleStorage');
  });

  it('should parse functions', () => {
    const result = parser.parse(simpleContract, 'SimpleStorage');
    const functionNames = result.functions.map((f) => f.name);
    expect(functionNames).toContain('setValue');
    expect(functionNames).toContain('getValue');
  });

  it('should parse imports', () => {
    const result = parser.parse(simpleContract, 'SimpleStorage');
    expect(result.imports.length).toBeGreaterThan(0);
    expect(result.imports[0]!.path).toContain('Ownable');
  });

  it('should parse compiler version', () => {
    const result = parser.parse(simpleContract, 'SimpleStorage');
    expect(result.compilerVersion).toContain('0.8');
  });

  it('should parse license', () => {
    const result = parser.parse(simpleContract, 'SimpleStorage');
    expect(result.license).toBe('MIT');
  });
});

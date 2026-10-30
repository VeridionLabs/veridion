jest.mock('@stellar/stellar-sdk', () => {
  const transaction = { sign: jest.fn() };
  const server = {
    getAccount: jest.fn().mockResolvedValue({ accountId: () => 'Gwallet' }),
    prepareTransaction: jest.fn().mockResolvedValue(transaction),
    sendTransaction: jest.fn().mockResolvedValue({ status: 'PENDING', hash: 'tx-hash' }),
    pollTransaction: jest.fn().mockResolvedValue({ status: 'SUCCESS' }),
  };
  const builder = {
    addOperation: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue(transaction),
  };

  return {
    Address: jest.fn().mockImplementation(() => ({ toScVal: () => ({ address: true }) })),
    BASE_FEE: '100',
    Contract: jest.fn().mockImplementation(() => ({ call: jest.fn() })),
    Keypair: { fromSecret: jest.fn().mockReturnValue({ publicKey: () => 'Gwallet' }) },
    Networks: { TESTNET: 'Test SDF Network ; September 2015' },
    nativeToScVal: jest.fn((value: unknown) => ({ value })),
    rpc: {
      Api: { GetTransactionStatus: { SUCCESS: 'SUCCESS' } },
      Server: jest.fn().mockReturnValue(server),
    },
    TransactionBuilder: jest.fn().mockReturnValue(builder),
  };
});

import { SorobanClient } from './soroban-client';

describe('SorobanClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // SorobanClient reads its configuration straight from process.env, so the
    // test arranges the environment rather than injecting a ConfigService.
    process.env = {
      ...originalEnv,
      STELLAR_SECRET_KEY: 'secret',
      STELLAR_NETWORK: 'TESTNET',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('builds and confirms register_audit through the audit registry', async () => {
    const sdk: {
      Contract: jest.Mock;
      rpc: { Server: jest.Mock };
    } = jest.requireMock('@stellar/stellar-sdk');
    const client = new SorobanClient();
    const server = sdk.rpc.Server.mock.results[0]?.value;

    await expect(
      client.registerAudit({
        auditor: 'Gwallet',
        auditId: 'audit-id',
        projectId: 'project-id',
        projectName: 'Example',
        contractHash: 'contract-hash',
        reportHash: 'report-hash',
        securityScore: 90,
        version: '1.0.0',
      }),
    ).resolves.toEqual({ transactionHash: 'tx-hash', status: 'SUCCESS' });

    expect(sdk.Contract).toHaveBeenCalledWith(
      'CDZLMOM3IPXG7FFHMVYGR3LFU6L36WQAMXGCRY2BYHSRCYRYAOVYPIWL',
    );
    expect(server.sendTransaction).toHaveBeenCalled();
    expect(server.pollTransaction).toHaveBeenCalledWith(
      'tx-hash',
      expect.objectContaining({ attempts: 3 }),
    );
  });
});

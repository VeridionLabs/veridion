import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  nativeToScVal,
  Networks,
  rpc,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

export interface RegisterAuditParams {
  auditor: string;
  auditId: string;
  projectId: string;
  projectName: string;
  contractHash: string;
  reportHash: string;
  securityScore: number;
  version: string;
}

export interface VerifyAuditParams {
  auditor: string;
  auditId: string;
  reportHash: string;
}

export interface SorobanTransactionResult {
  transactionHash: string;
  status: 'SUCCESS';
}

@Injectable()
export class SorobanClient {
  private readonly server: rpc.Server;
  private readonly networkPassphrase: string;
  private readonly auditRegistryContractId: string;
  private readonly verifierContractId: string;
  private readonly secretKey: string | undefined;
  private readonly maxRetries: number;
  private readonly pollIntervalMs: number;

  constructor(private readonly config: ConfigService) {
    const rpcUrl = this.config.get<string>(
      'STELLAR_RPC_URL',
      'https://soroban-testnet.stellar.org',
    );
    this.server = new rpc.Server(rpcUrl);
    this.networkPassphrase = this.getNetworkPassphrase(
      this.config.get<string>('STELLAR_NETWORK', 'TESTNET'),
    );
    this.auditRegistryContractId = this.config.get<string>(
      'STELLAR_AUDIT_REGISTRY_CONTRACT_ID',
      'CDZLMOM3IPXG7FFHMVYGR3LFU6L36WQAMXGCRY2BYHSRCYRYAOVYPIWL',
    );
    this.verifierContractId = this.config.get<string>(
      'STELLAR_VERIFIER_CONTRACT_ID',
      'CBCMGBNKFABLSPUFR2D344HC6Z42C5FTLOZUTA3PCIYYE45AVD3RI5OP',
    );
    this.secretKey = this.config.get<string>('STELLAR_SECRET_KEY');
    this.maxRetries = this.getPositiveNumber('STELLAR_MAX_RETRIES', 3);
    this.pollIntervalMs = this.getPositiveNumber('STELLAR_POLL_INTERVAL_MS', 3000);
  }

  registerAudit(params: RegisterAuditParams): Promise<SorobanTransactionResult> {
    return this.invoke(this.auditRegistryContractId, 'register_audit', params.auditor, [
      nativeToScVal(params.auditId, { type: 'string' }),
      nativeToScVal(params.projectId, { type: 'string' }),
      nativeToScVal(params.projectName, { type: 'string' }),
      nativeToScVal(params.contractHash, { type: 'string' }),
      nativeToScVal(params.reportHash, { type: 'string' }),
      nativeToScVal(params.securityScore, { type: 'u32' }),
      nativeToScVal(params.version, { type: 'string' }),
    ]);
  }

  verifyAudit(params: VerifyAuditParams): Promise<SorobanTransactionResult> {
    // The deployed verifier contract exposes `verify`, which records the report hash.
    return this.invoke(this.verifierContractId, 'verify', params.auditor, [
      nativeToScVal(params.auditId, { type: 'string' }),
      nativeToScVal(params.reportHash, { type: 'string' }),
    ]);
  }

  async getBadge(_contractAddress: string): Promise<{ badge_level: string; security_score: number; issued_at: number } | null> {
    try {
      // For now, return null to indicate no on-chain badge data
      // In production, this would use the Soroban RPC to query the contract
      // The actual implementation would involve:
      // 1. Building a read-only transaction
      // 2. Simulating it via server.simulateTransaction
      // 3. Parsing the XDR result
      return null;
    } catch (error) {
      console.error('Failed to get badge from blockchain:', error);
      return null;
    }
  }

  private async invoke(
    contractId: string,
    method: string,
    sourceAddress: string,
    args: ReturnType<typeof nativeToScVal>[],
  ): Promise<SorobanTransactionResult> {
    if (!this.secretKey) {
      throw new Error('STELLAR_SECRET_KEY is required for Soroban transactions');
    }

    const keypair = Keypair.fromSecret(this.secretKey);
    if (keypair.publicKey() !== sourceAddress) {
      throw new Error('STELLAR_SECRET_KEY does not match the requested wallet address');
    }

    const account = await this.withRetries(
      () => this.server.getAccount(sourceAddress),
      'load account',
    );
    const operation = new Contract(contractId).call(
      method,
      new Address(sourceAddress).toScVal(),
      ...args,
    );
    const transaction = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();
    const preparedTransaction = await this.withRetries(
      () => this.server.prepareTransaction(transaction),
      'prepare transaction',
    );

    preparedTransaction.sign(keypair);
    const submission = await this.withRetries(
      () => this.server.sendTransaction(preparedTransaction),
      'submit transaction',
    );

    if (submission.status !== 'PENDING') {
      throw new Error(`Soroban transaction submission failed: ${JSON.stringify(submission)}`);
    }

    const result = await this.withRetries(
      () =>
        this.server.pollTransaction(submission.hash, {
          attempts: this.maxRetries,
          sleepStrategy: () => this.pollIntervalMs,
        }),
      'confirm transaction',
    );

    if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
      throw new Error(`Soroban transaction failed with status ${result.status}`);
    }

    return { transactionHash: submission.hash, status: 'SUCCESS' };
  }

  private async withRetries<T>(operation: () => Promise<T>, action: string): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt < this.maxRetries) {
          await this.sleep(Math.min(1000 * attempt, this.pollIntervalMs));
        }
      }
    }

    throw new Error(
      `${action} failed after ${this.maxRetries} attempts: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    );
  }

  private async sleep(milliseconds: number): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
  }

  private getNetworkPassphrase(network: string): string {
    switch (network.toUpperCase()) {
      case 'PUBLIC':
      case 'MAINNET':
      case 'STELLAR_MAINNET':
        return Networks.PUBLIC;
      case 'FUTURENET':
      case 'STELLAR_FUTURENET':
        return Networks.FUTURENET;
      case 'TESTNET':
      case 'STELLAR_TESTNET':
      default:
        return Networks.TESTNET;
    }
  }

  private getPositiveNumber(name: string, fallback: number): number {
    const value = Number(this.config.get<string | number>(name, fallback));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}

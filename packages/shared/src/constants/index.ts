export const APP_NAME = 'Veridion';
export const APP_VERSION = '0.1.0';
export const APP_DESCRIPTION = 'AI-powered smart contract security platform';

export const API_DEFAULTS = {
  PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  RATE_LIMIT_WINDOW_MS: 60_000,
  RATE_LIMIT_MAX_REQUESTS: 100,
} as const;

export const SECURITY = {
  BCRYPT_ROUNDS: 12,
  JWT_ACCESS_EXPIRATION: '15m',
  JWT_REFRESH_EXPIRATION: '7d',
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION_MS: 15 * 60 * 1000,
} as const;

export const BLOCKCHAIN = {
  STELLAR: {
    DEFAULT_FEE: 100,
    TIMEOUT_SECONDS: 30,
    CONFIRMATION_BLOCKS: 3,
  },
} as const;

export const SUPPORTED_CHAINS = ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism', 'stellar'] as const;
export const SUPPORTED_LANGUAGES = ['solidity', 'vyper', 'rust', 'move'] as const;

export const SEVERITY_WEIGHTS: Record<string, number> = {
  CRITICAL: 10,
  HIGH: 7,
  MEDIUM: 4,
  LOW: 2,
  GAS: 1,
  INFORMATIONAL: 0,
};

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const MAX_CONTRACT_SIZE_LINES = 5000;

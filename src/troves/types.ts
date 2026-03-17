export interface TrovesDepositToken {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logo?: string;
}

export interface TrovesStrategyAPIResult {
  name: string;
  id: string;
  apy: number | string;
  apySplit: {
    baseApy: number;
    rewardsApy: number;
  };
  depositToken: TrovesDepositToken[];
  leverage: number;
  contract: Array<{
    name: string;
    address: string;
  }>;
  tvlUsd: number;
  status: {
    number: number;
    value: string;
  };
  liveStatus?: string;
  riskFactor: number;
  riskFactors?: Array<{ name: string; value: number }>;
  isAudited: boolean;
  auditUrl?: string;
  realizedApy?: number;
  apyMethodology?: string;
  realizedApyMethodology?: string;
  assets: string[];
  protocols: string[];
  tags?: string[];
  isRetired: boolean;
  isDeprecated?: boolean;
  lastAumUpdate?: string;
  discontinuationInfo?: {
    date?: Date;
    reason?: unknown;
    info?: unknown;
  };
  curator?: unknown;
  redemptionInfo?: unknown;
  points?: unknown[];
}

export interface TrovesStrategiesResponse {
  status: boolean;
  lastUpdated: string;
  source: string;
  strategies: TrovesStrategyAPIResult[];
}

export interface TrovesStatsResponse {
  tvl: number;
  lastUpdated: string;
}

export interface TrovesRawCall {
  contractAddress: string;
  entrypoint: string;
  calldata: (string | number | boolean)[];
}

export interface TrovesCallTokenInfo {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
}

export interface TrovesCallResult {
  tokenInfo: TrovesCallTokenInfo;
  calls: TrovesRawCall[];
  alerts?: string[];
}

export interface TrovesDepositCallsResponse {
  success: boolean;
  results: TrovesCallResult[];
  strategyId: string;
  isDeposit: boolean;
}

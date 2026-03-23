import type { Call } from "starknet";
import type { WalletInterface } from "@/wallet/interface";
import type { ExecuteOptions } from "@/types";
import type { Tx } from "@/tx";
import type {
  TrovesStrategiesResponse,
  TrovesStatsResponse,
  TrovesDepositCallsResponse,
  TrovesRawCall,
} from "@/troves/types";

const TROVES_API_BASE = "https://app.troves.fi";

export interface TrovesOptions {
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

function normalizeCalldata(raw: TrovesRawCall): Call {
  const calldata = Array.isArray(raw.calldata)
    ? raw.calldata.map((v: unknown) => {
        if (typeof v === "bigint") return v.toString();
        if (typeof v === "object" && v !== null) return JSON.stringify(v);
        if (typeof v === "boolean") return v ? "1" : "0";
        return String(v);
      })
    : [];
  return {
    contractAddress: raw.contractAddress,
    entrypoint: raw.entrypoint,
    calldata,
  };
}

/**
 * Troves module for interacting with Troves DeFi strategies via StarkZap.
 *
 * Read operations (getStrategies, getStats) use Troves HTTP APIs.
 * Write operations (deposit, withdraw) call the Troves deposit/withdraw API to get
 * transaction calls, then execute them via wallet.execute().
 *
 * @example
 * ```ts
 * const wallet = await sdk.connectWallet({ account: { signer } });
 * const troves = new Troves(wallet);
 *
 * const strategies = await troves.getStrategies();
 * const stats = await troves.getStats();
 * const tx = await troves.deposit(
 *   { strategyId: "evergreen_strk", amountRaw: "1000000000000000000" },
 *   {}
 * );
 * ```
 */
export class Troves {
  private readonly wallet: WalletInterface;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(wallet: WalletInterface, options?: TrovesOptions) {
    this.wallet = wallet;
    this.fetcher =
      options?.fetcher ??
      ((url: RequestInfo | URL, init?: RequestInit) => fetch(url, init));
    this.timeoutMs = options?.timeoutMs ?? 15000;
  }

  private async fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const res = await this.fetcher(`${TROVES_API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) {
      throw new Error(
        `Troves API failed: ${res.status} ${res.statusText} - ${path}`
      );
    }
    return res.json() as Promise<T>;
  }

  async getStrategies(options?: {
    noCache?: boolean;
  }): Promise<TrovesStrategiesResponse> {
    const path = options?.noCache
      ? "/api/strategies?no_cache=true"
      : "/api/strategies";
    return this.fetchJson<TrovesStrategiesResponse>(path);
  }

  async getStats(): Promise<TrovesStatsResponse> {
    return this.fetchJson<TrovesStatsResponse>("/api/stats");
  }

  async populateDepositCalls(params: {
    strategyId: string;
    amountRaw: string;
    amount2Raw?: string;
    address?: string;
  }): Promise<Call[]> {
    const address = params.address ?? String(this.wallet.address);
    const body = {
      strategyId: params.strategyId,
      amountRaw: params.amountRaw,
      amount2Raw: params.amount2Raw,
      isDeposit: true,
      address,
    };
    const data = await this.fetchJson<TrovesDepositCallsResponse>(
      "/api/deposits/calls",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    if (!data.success || !data.results?.length) {
      throw new Error(
        `Troves deposit API returned no calls for strategy "${params.strategyId}"`
      );
    }
    const calls: Call[] = [];
    for (const result of data.results) {
      for (const raw of result.calls) {
        calls.push(normalizeCalldata(raw));
      }
    }
    return calls;
  }

  async populateWithdrawCalls(params: {
    strategyId: string;
    amountRaw: string;
    amount2Raw?: string;
    address?: string;
  }): Promise<Call[]> {
    const address = params.address ?? String(this.wallet.address);
    const body = {
      strategyId: params.strategyId,
      amountRaw: params.amountRaw,
      amount2Raw: params.amount2Raw,
      isDeposit: false,
      address,
    };
    const data = await this.fetchJson<TrovesDepositCallsResponse>(
      "/api/deposits/calls",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    if (!data.success || !data.results?.length) {
      throw new Error(
        `Troves withdraw API returned no calls for strategy "${params.strategyId}"`
      );
    }
    const calls: Call[] = [];
    for (const result of data.results) {
      for (const raw of result.calls) {
        calls.push(normalizeCalldata(raw));
      }
    }
    return calls;
  }

  async deposit(
    params: {
      strategyId: string;
      amountRaw: string;
      amount2Raw?: string;
    },
    options?: ExecuteOptions
  ): Promise<Tx> {
    const calls = await this.populateDepositCalls(params);
    return this.wallet.execute(calls, options);
  }

  async withdraw(
    params: {
      strategyId: string;
      amountRaw: string;
      amount2Raw?: string;
    },
    options?: ExecuteOptions
  ): Promise<Tx> {
    const calls = await this.populateWithdrawCalls(params);
    return this.wallet.execute(calls, options);
  }
}

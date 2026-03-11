import { type Call, Contract, uint256 } from "starknet";
import type { WalletInterface } from "@/wallet/interface";
import type { Amount, ExecuteOptions } from "@/types";
import { fromAddress } from "@/types/address";
import type { Tx } from "@/tx";
import { getEndurLstConfig, type EndurLstConfig } from "@/endur/presets";
import { LST_ABI } from "@/endur/abi/lst";

export interface EndurStatsResponse {
  asset: string;
  tvl: number;
  tvlStrk: number;
  apy: number;
  apyInPercentage: string;
}

export interface EndurLstStatsItem {
  asset: string;
  assetAddress?: string;
  lstAddress?: string;
  tvlUsd: number;
  tvlAsset: number;
  apy: number;
  apyInPercentage: string;
  exchangeRate?: number;
  preciseExchangeRate?: string;
}

export interface EndurOptions {
  apiBaseUrl?: string;
  fetcher?: typeof fetch;
}

export interface EndurAPYResult {
  strk?: { apy: number; apyInPercentage: string };
  lsts?: Record<string, { apy: number; apyInPercentage: string }>;
}

export interface EndurTVLResult {
  strk?: { tvl: number; tvlStrk: number };
  lsts?: EndurLstStatsItem[];
}

/**
 * Endur module for interacting with Endur LST staking via StarkZap.
 *
 * Accepts the StarkZap wallet in its constructor. Read operations (getAPY, getTVL)
 * use Endur's HTTP APIs. Write operations (deposit, withdraw) use wallet.execute()
 * with LST contract calldata.
 *
 * @example
 * ```ts
 * const wallet = await sdk.connectWallet({ account: { signer } });
 * const endur = new Endur(wallet, { apiBaseUrl: "https://app.endur.fi" });
 *
 * const apy = await endur.getAPY();
 * const tvl = await endur.getTVL();
 * const tx = await endur.deposit({ asset: "STRK", amount: Amount.parse("100", 18) }, {});
 * ```
 */
export class Endur {
  private readonly wallet: WalletInterface;
  private readonly apiBaseUrl: string | undefined;
  private readonly fetcher: typeof fetch;

  constructor(wallet: WalletInterface, options?: EndurOptions) {
    this.wallet = wallet;
    this.apiBaseUrl = options?.apiBaseUrl;
    this.fetcher =
      options?.fetcher ??
      ((url: RequestInfo | URL, init?: RequestInit) => fetch(url, init));
  }

  private assertApiBaseUrl(): string {
    if (!this.apiBaseUrl?.trim()) {
      throw new Error(
        "Endur apiBaseUrl is required for getAPY and getTVL. Pass it in the constructor options."
      );
    }
    const base = this.apiBaseUrl.trim().replace(/\/$/, "");
    return base;
  }

  async getAPY(asset?: string): Promise<EndurAPYResult> {
    const base = this.assertApiBaseUrl();
    const result: EndurAPYResult = {};

    const statsRes = await this.fetcher(`${base}/api/stats`);
    if (!statsRes.ok) {
      throw new Error(
        `Endur stats API failed: ${statsRes.status} ${statsRes.statusText}`
      );
    }
    const stats: EndurStatsResponse = await statsRes.json();
    result.strk = {
      apy: stats.apy,
      apyInPercentage: stats.apyInPercentage,
    };

    if (asset && asset.toUpperCase() !== "STRK") {
      const lstRes = await this.fetcher(`${base}/api/lst/stats`);
      if (!lstRes.ok) {
        throw new Error(
          `Endur LST stats API failed: ${lstRes.status} ${lstRes.statusText}`
        );
      }
      const lsts: EndurLstStatsItem[] = await lstRes.json();
      result.lsts = {};
      for (const item of lsts) {
        if (item.asset?.toLowerCase() === asset.toLowerCase()) {
          result.lsts[item.asset] = {
            apy: item.apy,
            apyInPercentage: item.apyInPercentage,
          };
          break;
        }
      }
    } else if (!asset) {
      const lstRes = await this.fetcher(`${base}/api/lst/stats`);
      if (lstRes.ok) {
        const lsts: EndurLstStatsItem[] = await lstRes.json();
        result.lsts = {};
        for (const item of lsts) {
          result.lsts[item.asset] = {
            apy: item.apy,
            apyInPercentage: item.apyInPercentage,
          };
        }
      }
    }

    return result;
  }

  async getTVL(asset?: string): Promise<EndurTVLResult> {
    const base = this.assertApiBaseUrl();
    const result: EndurTVLResult = {};

    const statsRes = await this.fetcher(`${base}/api/stats`);
    if (!statsRes.ok) {
      throw new Error(
        `Endur stats API failed: ${statsRes.status} ${statsRes.statusText}`
      );
    }
    const stats: EndurStatsResponse = await statsRes.json();
    result.strk = { tvl: stats.tvl, tvlStrk: stats.tvlStrk };

    if (!asset || asset.toUpperCase() !== "STRK") {
      const lstRes = await this.fetcher(`${base}/api/lst/stats`);
      if (!lstRes.ok) {
        throw new Error(
          `Endur LST stats API failed: ${lstRes.status} ${lstRes.statusText}`
        );
      }
      const lsts: EndurLstStatsItem[] = await lstRes.json();
      if (asset) {
        const match = lsts.find(
          (item) => item.asset?.toLowerCase() === asset.toLowerCase()
        );
        result.lsts = match ? [match] : [];
      } else {
        result.lsts = lsts;
      }
    }

    return result;
  }

  async deposit(
    params: {
      asset: string;
      amount: Amount;
    },
    options?: ExecuteOptions
  ): Promise<Tx> {
    const config = this.getLstConfigOrThrow(params.asset);

    if (params.amount.getDecimals() !== config.decimals) {
      throw new Error(
        `Amount decimals mismatch: expected ${config.decimals} for ${config.symbol}, got ${params.amount.getDecimals()}`
      );
    }

    const token = {
      name: config.symbol,
      address: fromAddress(config.assetAddress),
      decimals: config.decimals,
      symbol: config.symbol,
    };

    const approveCall = this.wallet
      .erc20(token)
      .populateApprove(fromAddress(config.lstAddress), params.amount);

    const lstContract = new Contract({
      abi: LST_ABI,
      address: config.lstAddress,
    });
    const depositCall = lstContract.populate("deposit", [
      uint256.bnToUint256(params.amount.toBase()),
      this.wallet.address,
    ]) as Call;

    return this.wallet.execute([approveCall, depositCall], options);
  }

  async withdraw(
    params: {
      asset: string;
      amount: Amount;
    },
    options?: ExecuteOptions
  ): Promise<Tx> {
    const config = this.getLstConfigOrThrow(params.asset);

    if (params.amount.getDecimals() !== config.decimals) {
      throw new Error(
        `Amount decimals mismatch: expected ${config.decimals} for ${config.lstSymbol}, got ${params.amount.getDecimals()}`
      );
    }

    const lstContract = new Contract({
      abi: LST_ABI,
      address: config.lstAddress,
    });
    const redeemCall = lstContract.populate("redeem", [
      uint256.bnToUint256(params.amount.toBase()),
      this.wallet.address,
      this.wallet.address,
    ]) as Call;

    return this.wallet.execute([redeemCall], options);
  }

  private getLstConfigOrThrow(asset: string): EndurLstConfig {
    const config = getEndurLstConfig(this.wallet.getChainId(), asset);
    if (!config) {
      throw new Error(
        `Unsupported asset "${asset}" for chain ${this.wallet.getChainId().toLiteral()}. ` +
          "Use STRK, WBTC, tBTC, LBTC, solvBTC on mainnet, or STRK, TBTC1, TBTC2 on Sepolia."
      );
    }
    return config;
  }
}

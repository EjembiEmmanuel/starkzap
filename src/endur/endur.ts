import { type Call, Contract, uint256 } from "starknet";
import type { WalletInterface } from "@/wallet/interface";
import type { Amount, ExecuteOptions } from "@/types";
import type { Tx } from "@/tx";
import {
  getEndurLstConfig,
  getSupportedAssetSymbols,
  type EndurLstConfig,
} from "@/endur/presets";
import { LST_ABI } from "@/endur/abi/lst";

export interface EndurLstStatsItem {
  asset: string;
  tvlUsd: number;
  tvlAsset: number;
  apy: number;
  apyInPercentage: string;
}

export interface EndurOptions {
  apiBaseUrl?: string;
  fetcher?: typeof fetch;
}

export type EndurAPYResult = Record<
  string,
  { apy: number; apyInPercentage: string }
>;

export interface EndurTVLItem {
  asset: string;
  tvlUsd: number;
  tvlAsset: number;
}

export type EndurTVLResult = EndurTVLItem[];

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
    return this.apiBaseUrl.trim().replace(/\/$/, "");
  }

  async getAPY(asset?: string): Promise<EndurAPYResult> {
    const base = this.assertApiBaseUrl();
    const lstRes = await this.fetcher(`${base}/api/lst/stats`);
    if (!lstRes.ok) {
      throw new Error(
        `Endur LST stats API failed: ${lstRes.status} ${lstRes.statusText}`
      );
    }
    const lsts: EndurLstStatsItem[] = await lstRes.json();
    const result: EndurAPYResult = {};

    for (const item of lsts) {
      if (!asset || item.asset?.toLowerCase() === asset.toLowerCase()) {
        result[item.asset] = {
          apy: item.apy,
          apyInPercentage: item.apyInPercentage,
        };
        if (asset) break;
      }
    }
    return result;
  }

  async getTVL(asset?: string): Promise<EndurTVLResult> {
    const base = this.assertApiBaseUrl();
    const lstRes = await this.fetcher(`${base}/api/lst/stats`);
    if (!lstRes.ok) {
      throw new Error(
        `Endur LST stats API failed: ${lstRes.status} ${lstRes.statusText}`
      );
    }
    const lsts: EndurLstStatsItem[] = await lstRes.json();
    const mapToTvlItem = (item: EndurLstStatsItem): EndurTVLItem => ({
      asset: item.asset,
      tvlUsd: item.tvlUsd,
      tvlAsset: item.tvlAsset,
    });

    if (asset) {
      const match = lsts.find(
        (item) => item.asset?.toLowerCase() === asset.toLowerCase()
      );
      return match ? [mapToTvlItem(match)] : [];
    }
    return lsts.map(mapToTvlItem);
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

    // Token object for approve only; name set from symbol for simplicity.
    const token = {
      name: config.symbol,
      address: config.assetAddress,
      decimals: config.decimals,
      symbol: config.symbol,
    };

    const approveCall = this.wallet
      .erc20(token)
      .populateApprove(config.lstAddress, params.amount);

    // Contract used only for populate() (calldata); not attached to provider for reads.
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

    // Contract used only for populate() (calldata); not attached to provider for reads.
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
    const chainId = this.wallet.getChainId();
    const config = getEndurLstConfig(chainId, asset);
    if (!config) {
      const supported = getSupportedAssetSymbols(chainId).join(", ");
      throw new Error(
        `Unsupported asset "${asset}" for chain ${chainId.toLiteral()}. Supported: ${supported || "none"}.`
      );
    }
    return config;
  }
}

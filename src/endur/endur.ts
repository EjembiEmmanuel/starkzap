import { byteArray, CallData, type Call, uint256 } from "starknet";
import type { WalletInterface } from "@/wallet/interface";
import type { Amount, ExecuteOptions } from "@/types";
import type { Tx } from "@/tx";
import {
  getEndurLstConfig,
  getSupportedAssetSymbols,
  type EndurLstConfig,
} from "@/endur/presets";

declare const EndurAssetSymbolBrand: unique symbol;

/**
 * Branded type for Endur LST asset symbols (e.g. STRK, WBTC, tBTC).
 * Use EndurAssetSymbol.from() to create from a string.
 */
export type EndurAssetSymbol = string & {
  readonly [EndurAssetSymbolBrand]: true;
};

/**
 * Create an EndurAssetSymbol from a string.
 * @param symbol - Asset symbol (e.g. "STRK", "WBTC")
 * @throws Error if symbol is empty or not a string
 */
export function EndurAssetSymbol(symbol: string): EndurAssetSymbol {
  const s = typeof symbol === "string" ? symbol.trim() : "";
  if (!s) {
    throw new Error("EndurAssetSymbol requires a non-empty string");
  }
  return s as EndurAssetSymbol;
}

export interface EndurLstStatsItem {
  asset: EndurAssetSymbol;
  tvlUsd: number;
  tvlAsset: number;
  apy: number;
  apyInPercentage: string;
}

export interface EndurOptions {
  apiBaseUrl?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

export type EndurAPYResult = Partial<
  Record<EndurAssetSymbol, { apy: number; apyInPercentage: string }>
>;

export interface EndurTVLItem {
  asset: EndurAssetSymbol;
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
  private readonly timeoutMs: number;

  constructor(wallet: WalletInterface, options?: EndurOptions) {
    this.wallet = wallet;
    this.apiBaseUrl = options?.apiBaseUrl;
    this.fetcher =
      options?.fetcher ??
      ((url: RequestInfo | URL, init?: RequestInit) => fetch(url, init));
    this.timeoutMs = options?.timeoutMs ?? 15000;
  }

  private assertApiBaseUrl(): string {
    if (!this.apiBaseUrl?.trim()) {
      throw new Error(
        "Endur apiBaseUrl is required for getAPY and getTVL. Pass it in the constructor options."
      );
    }
    return this.apiBaseUrl.trim().replace(/\/$/, "");
  }

  private async fetchLstStats(): Promise<EndurLstStatsItem[]> {
    const base = this.assertApiBaseUrl();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const lstRes = await this.fetcher(`${base}/api/lst/stats`, {
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!lstRes.ok) {
      throw new Error(
        `Endur LST stats API failed: ${lstRes.status} ${lstRes.statusText}`
      );
    }
    const raw = await lstRes.json();
    return this.parseLstStats(raw);
  }

  private parseLstStats(raw: unknown): EndurLstStatsItem[] {
    if (!Array.isArray(raw)) {
      throw new Error(
        `Endur LST stats API returned unexpected shape: expected array, got ${typeof raw}. Raw payload: ${JSON.stringify(raw).slice(0, 500)}${JSON.stringify(raw).length > 500 ? "..." : ""}`
      );
    }
    const valid: EndurLstStatsItem[] = [];
    for (let i = 0; i < raw.length; i++) {
      const item = raw[i];
      if (item === null || typeof item !== "object") {
        throw new Error(
          `Endur LST stats API item at index ${i} is not an object. Raw item: ${JSON.stringify(item)}`
        );
      }
      const obj = item as Record<string, unknown>;
      const asset = obj.asset;
      const apy = obj.apy;
      const apyInPercentage = obj.apyInPercentage;
      const tvlUsd = obj.tvlUsd;
      const tvlAsset = obj.tvlAsset;
      if (
        typeof asset !== "string" ||
        typeof apy !== "number" ||
        typeof apyInPercentage !== "string" ||
        typeof tvlUsd !== "number" ||
        typeof tvlAsset !== "number"
      ) {
        continue;
      }
      valid.push({
        asset: asset as EndurAssetSymbol,
        apy,
        apyInPercentage,
        tvlUsd,
        tvlAsset,
      });
    }
    return valid;
  }

  private filterSupportedByChain(
    items: EndurLstStatsItem[]
  ): EndurLstStatsItem[] {
    const chainId = this.wallet.getChainId();
    const supported = new Set(
      getSupportedAssetSymbols(chainId).map((s) => s.toLowerCase())
    );
    return items.filter((i) => supported.has(i.asset.toLowerCase()));
  }

  async getAPY(asset?: EndurAssetSymbol): Promise<EndurAPYResult> {
    const lsts = this.filterSupportedByChain(await this.fetchLstStats());
    const result: EndurAPYResult = {};

    for (const item of lsts) {
      const itemAsset = item.asset;
      if (!itemAsset) continue;
      if (
        !asset ||
        itemAsset.toLowerCase() === (asset as string).toLowerCase()
      ) {
        const apy = typeof item.apy === "number" ? item.apy : 0;
        const apyInPercentage =
          typeof item.apyInPercentage === "string"
            ? item.apyInPercentage
            : String(apy * 100);
        result[itemAsset] = { apy, apyInPercentage };
        if (asset) break;
      }
    }
    return result;
  }

  async getTVL(asset?: EndurAssetSymbol): Promise<EndurTVLResult> {
    const lsts = this.filterSupportedByChain(await this.fetchLstStats());
    const mapToTvlItem = (item: EndurLstStatsItem): EndurTVLItem => ({
      asset: item.asset,
      tvlUsd: typeof item.tvlUsd === "number" ? item.tvlUsd : 0,
      tvlAsset: typeof item.tvlAsset === "number" ? item.tvlAsset : 0,
    });

    if (asset) {
      const match = lsts.find(
        (i) => i.asset?.toLowerCase() === asset.toLowerCase()
      );
      return match ? [mapToTvlItem(match)] : [];
    }
    return lsts.map(mapToTvlItem);
  }

  async deposit(
    params: {
      asset: EndurAssetSymbol;
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

    const depositCall: Call = {
      contractAddress: config.lstAddress,
      entrypoint: "deposit",
      calldata: CallData.compile([
        uint256.bnToUint256(params.amount.toBase()),
        this.wallet.address,
      ]),
    };

    return this.wallet.execute([approveCall, depositCall], options);
  }

  /**
   * Deposit assets into the LST with a referral code. Same as deposit() but routes
   * rewards to the referrer for the given referral code.
   *
   * @param params.asset - Asset symbol (e.g. "STRK", "WBTC")
   * @param params.amount - Amount to deposit
   * @param params.referralCode - Referral code string (e.g. "ABC123")
   */
  async depositWithReferral(
    params: {
      asset: EndurAssetSymbol;
      amount: Amount;
      referralCode: string;
    },
    options?: ExecuteOptions
  ): Promise<Tx> {
    const referralCode = params.referralCode?.trim();
    if (!referralCode) {
      throw new Error("depositWithReferral requires a non-empty referralCode");
    }

    const config = this.getLstConfigOrThrow(params.asset);

    if (params.amount.getDecimals() !== config.decimals) {
      throw new Error(
        `Amount decimals mismatch: expected ${config.decimals} for ${config.symbol}, got ${params.amount.getDecimals()}`
      );
    }

    const token = {
      name: config.symbol,
      address: config.assetAddress,
      decimals: config.decimals,
      symbol: config.symbol,
    };

    const approveCall = this.wallet
      .erc20(token)
      .populateApprove(config.lstAddress, params.amount);

    const depositWithReferralCall: Call = {
      contractAddress: config.lstAddress,
      entrypoint: "deposit_with_referral",
      calldata: CallData.compile([
        uint256.bnToUint256(params.amount.toBase()),
        this.wallet.address,
        byteArray.byteArrayFromString(referralCode),
      ]),
    };

    return this.wallet.execute([approveCall, depositWithReferralCall], options);
  }

  async withdraw(
    params: {
      asset: EndurAssetSymbol;
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

    const redeemCall: Call = {
      contractAddress: config.lstAddress,
      entrypoint: "redeem",
      calldata: CallData.compile([
        uint256.bnToUint256(params.amount.toBase()),
        this.wallet.address,
        this.wallet.address,
      ]),
    };

    return this.wallet.execute([redeemCall], options);
  }

  private getLstConfigOrThrow(asset: EndurAssetSymbol): EndurLstConfig {
    const chainId = this.wallet.getChainId();
    const config = getEndurLstConfig(chainId, asset as string);
    if (!config) {
      const supported = getSupportedAssetSymbols(chainId).join(", ");
      throw new Error(
        `Unsupported asset "${asset}" for chain ${chainId.toLiteral()}. Supported: ${supported || "none"}.`
      );
    }
    return config;
  }
}

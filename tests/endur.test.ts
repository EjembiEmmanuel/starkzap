import { describe, expect, it, vi } from "vitest";
import { fromAddress, Amount, ChainId } from "@/types";
import type { WalletInterface } from "@/wallet/interface";
import { Endur } from "@/endur";
import { getEndurLstConfig } from "@/endur/presets";

const mockTx = {
  hash: "0xmocktxhash",
  wait: vi.fn().mockResolvedValue(undefined),
};

function createMockWallet(chainId: ChainId = ChainId.MAINNET): WalletInterface {
  const mockErc20 = {
    populateApprove: vi.fn().mockReturnValue({
      contractAddress: "0xasset",
      entrypoint: "approve",
      calldata: [],
    }),
  };
  return {
    address: fromAddress(
      "0x0234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    ),
    execute: vi.fn().mockResolvedValue(mockTx),
    getChainId: () => chainId,
    erc20: vi.fn().mockReturnValue(mockErc20),
  } as unknown as WalletInterface;
}

describe("getEndurLstConfig", () => {
  it("should return STRK config for mainnet", () => {
    const config = getEndurLstConfig(ChainId.MAINNET, "STRK");
    expect(config).toBeDefined();
    expect(config!.symbol).toBe("STRK");
    expect(config!.lstSymbol).toBe("xSTRK");
  });

  it("should return WBTC config for mainnet", () => {
    const config = getEndurLstConfig(ChainId.MAINNET, "WBTC");
    expect(config).toBeDefined();
    expect(config!.symbol).toBe("WBTC");
  });

  it("should return undefined for unknown asset", () => {
    const config = getEndurLstConfig(ChainId.MAINNET, "UNKNOWN");
    expect(config).toBeUndefined();
  });

  it("should be case-insensitive", () => {
    expect(getEndurLstConfig(ChainId.MAINNET, "strk")).toBeDefined();
    expect(getEndurLstConfig(ChainId.MAINNET, "wbTC")).toBeDefined();
  });

  it("should return Sepolia configs", () => {
    const strk = getEndurLstConfig(ChainId.SEPOLIA, "STRK");
    expect(strk).toBeDefined();
    const tbtc1 = getEndurLstConfig(ChainId.SEPOLIA, "TBTC1");
    expect(tbtc1).toBeDefined();
  });
});

describe("Endur", () => {
  describe("constructor and apiBaseUrl", () => {
    it("should throw when getAPY called without apiBaseUrl", async () => {
      const wallet = createMockWallet();
      const endur = new Endur(wallet);

      await expect(endur.getAPY()).rejects.toThrow(
        "Endur apiBaseUrl is required for getAPY and getTVL"
      );
    });

    it("should throw when getTVL called without apiBaseUrl", async () => {
      const wallet = createMockWallet();
      const endur = new Endur(wallet);

      await expect(endur.getTVL()).rejects.toThrow(
        "Endur apiBaseUrl is required for getAPY and getTVL"
      );
    });
  });

  describe("getAPY with mocked fetcher", () => {
    it("should return all assets when asset is undefined", async () => {
      const wallet = createMockWallet();
      const lstStatsJson = [
        {
          asset: "STRK",
          apy: 0.1,
          apyInPercentage: "10%",
          tvlUsd: 1000,
          tvlAsset: 500,
        },
        {
          asset: "WBTC",
          apy: 0.05,
          apyInPercentage: "5%",
          tvlUsd: 100,
          tvlAsset: 2,
        },
        {
          asset: "tBTC",
          apy: 0.04,
          apyInPercentage: "4%",
          tvlUsd: 50,
          tvlAsset: 1,
        },
      ];
      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(lstStatsJson),
      });

      const endur = new Endur(wallet, {
        apiBaseUrl: "https://app.endur.fi",
        fetcher: fetcher as typeof fetch,
      });

      const result = await endur.getAPY();

      expect(result).toMatchObject({
        STRK: { apy: 0.1, apyInPercentage: "10%" },
        WBTC: { apy: 0.05, apyInPercentage: "5%" },
        tBTC: { apy: 0.04, apyInPercentage: "4%" },
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher).toHaveBeenCalledWith(
        "https://app.endur.fi/api/lst/stats"
      );
    });

    it("should return only STRK when asset is STRK", async () => {
      const wallet = createMockWallet();
      const lstStatsJson = [
        {
          asset: "STRK",
          apy: 0.12,
          apyInPercentage: "12%",
          tvlUsd: 1000,
          tvlAsset: 500,
        },
        {
          asset: "WBTC",
          apy: 0.05,
          apyInPercentage: "5%",
          tvlUsd: 100,
          tvlAsset: 2,
        },
      ];
      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(lstStatsJson),
      });

      const endur = new Endur(wallet, {
        apiBaseUrl: "https://app.endur.fi",
        fetcher: fetcher as typeof fetch,
      });

      const result = await endur.getAPY("STRK");

      expect(result.STRK).toEqual({ apy: 0.12, apyInPercentage: "12%" });
      expect(Object.keys(result)).toEqual(["STRK"]);
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("should return only requested asset when asset is specified", async () => {
      const wallet = createMockWallet();
      const lstStatsJson = [
        {
          asset: "STRK",
          apy: 0.1,
          apyInPercentage: "10%",
          tvlUsd: 1000,
          tvlAsset: 500,
        },
        {
          asset: "WBTC",
          apy: 0.05,
          apyInPercentage: "5%",
          tvlUsd: 100,
          tvlAsset: 2,
        },
      ];
      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(lstStatsJson),
      });

      const endur = new Endur(wallet, {
        apiBaseUrl: "https://app.endur.fi",
        fetcher: fetcher as typeof fetch,
      });

      const result = await endur.getAPY("WBTC");

      expect(result.WBTC).toEqual({ apy: 0.05, apyInPercentage: "5%" });
      expect(Object.keys(result)).toEqual(["WBTC"]);
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("should throw when LST stats API returns non-ok", async () => {
      const wallet = createMockWallet();
      const fetcher = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const endur = new Endur(wallet, {
        apiBaseUrl: "https://app.endur.fi",
        fetcher: fetcher as typeof fetch,
      });

      await expect(endur.getAPY()).rejects.toThrow(
        "Endur LST stats API failed: 500 Internal Server Error"
      );
    });
  });

  describe("getTVL with mocked fetcher", () => {
    it("should return all assets when asset is undefined", async () => {
      const wallet = createMockWallet();
      const lstStatsJson = [
        {
          asset: "STRK",
          tvlUsd: 1000,
          tvlAsset: 500,
          apy: 0.1,
          apyInPercentage: "10%",
        },
        {
          asset: "WBTC",
          tvlUsd: 100,
          tvlAsset: 2,
          apy: 0.05,
          apyInPercentage: "5%",
        },
      ];
      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(lstStatsJson),
      });

      const endur = new Endur(wallet, {
        apiBaseUrl: "https://app.endur.fi",
        fetcher: fetcher as typeof fetch,
      });

      const result = await endur.getTVL();

      const strkItem = result.find((i) => i.asset === "STRK");
      expect(strkItem).toEqual(
        expect.objectContaining({ asset: "STRK", tvlUsd: 1000, tvlAsset: 500 })
      );
      const wbtcItem = result.find((i) => i.asset === "WBTC");
      expect(wbtcItem).toEqual(
        expect.objectContaining({ asset: "WBTC", tvlUsd: 100, tvlAsset: 2 })
      );
      expect(result).toHaveLength(2);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher).toHaveBeenCalledWith(
        "https://app.endur.fi/api/lst/stats"
      );
    });

    it("should return only requested asset when asset is specified", async () => {
      const wallet = createMockWallet();
      const lstStatsJson = [
        {
          asset: "STRK",
          tvlUsd: 1000,
          tvlAsset: 500,
          apy: 0.1,
          apyInPercentage: "10%",
        },
        {
          asset: "WBTC",
          tvlUsd: 100,
          tvlAsset: 2,
          apy: 0.05,
          apyInPercentage: "5%",
        },
      ];
      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(lstStatsJson),
      });

      const endur = new Endur(wallet, {
        apiBaseUrl: "https://app.endur.fi",
        fetcher: fetcher as typeof fetch,
      });

      const result = await endur.getTVL("WBTC");

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({ asset: "WBTC", tvlUsd: 100, tvlAsset: 2 })
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("should throw when LST stats API returns non-ok", async () => {
      const wallet = createMockWallet();
      const fetcher = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      const endur = new Endur(wallet, {
        apiBaseUrl: "https://app.endur.fi",
        fetcher: fetcher as typeof fetch,
      });

      await expect(endur.getTVL()).rejects.toThrow(
        "Endur LST stats API failed: 404 Not Found"
      );
    });
  });

  describe("deposit", () => {
    it("should call execute with approve and deposit calls", async () => {
      const wallet = createMockWallet();
      const endur = new Endur(wallet, { apiBaseUrl: "https://app.endur.fi" });

      const tx = await endur.deposit(
        { asset: "STRK", amount: Amount.parse("100", 18) },
        {}
      );

      expect(wallet.execute).toHaveBeenCalledTimes(1);
      const [calls] = (wallet.execute as ReturnType<typeof vi.fn>).mock
        .calls[0]!;
      expect(calls).toHaveLength(2);
      expect(calls[0].entrypoint).toBe("approve");
      expect(calls[1].entrypoint).toBe("deposit");
      expect(tx.hash).toBe("0xmocktxhash");
    });

    it("should throw for unsupported asset", async () => {
      const wallet = createMockWallet();
      const endur = new Endur(wallet, { apiBaseUrl: "https://app.endur.fi" });

      await expect(
        endur.deposit({ asset: "UNKNOWN", amount: Amount.parse("100", 18) }, {})
      ).rejects.toThrow("Unsupported asset");
    });

    it("should throw on decimal mismatch", async () => {
      const wallet = createMockWallet();
      const endur = new Endur(wallet, { apiBaseUrl: "https://app.endur.fi" });

      await expect(
        endur.deposit(
          { asset: "STRK", amount: Amount.parse("100", 8) }, // STRK has 18 decimals
          {}
        )
      ).rejects.toThrow("Amount decimals mismatch");
    });
  });

  describe("depositWithReferral", () => {
    it("should call execute with approve and deposit_with_referral calls", async () => {
      const wallet = createMockWallet();
      const endur = new Endur(wallet, { apiBaseUrl: "https://app.endur.fi" });

      const tx = await endur.depositWithReferral(
        {
          asset: "STRK",
          amount: Amount.parse("100", 18),
          referralCode: "ABC123",
        },
        {}
      );

      expect(wallet.execute).toHaveBeenCalledTimes(1);
      const [calls] = (wallet.execute as ReturnType<typeof vi.fn>).mock
        .calls[0]!;
      expect(calls).toHaveLength(2);
      expect(calls[0].entrypoint).toBe("approve");
      expect(calls[1].entrypoint).toBe("deposit_with_referral");
      expect(calls[1].contractAddress).toBeDefined();
      expect(Array.isArray(calls[1].calldata)).toBe(true);
      expect(calls[1].calldata!.length).toBeGreaterThanOrEqual(3);
      expect(tx.hash).toBe("0xmocktxhash");
    });

    it("should throw for empty referralCode", async () => {
      const wallet = createMockWallet();
      const endur = new Endur(wallet, { apiBaseUrl: "https://app.endur.fi" });

      await expect(
        endur.depositWithReferral(
          {
            asset: "STRK",
            amount: Amount.parse("100", 18),
            referralCode: "",
          },
          {}
        )
      ).rejects.toThrow("requires a non-empty referralCode");

      await expect(
        endur.depositWithReferral(
          {
            asset: "STRK",
            amount: Amount.parse("100", 18),
            referralCode: "   ",
          },
          {}
        )
      ).rejects.toThrow("requires a non-empty referralCode");
    });

    it("should throw for unsupported asset", async () => {
      const wallet = createMockWallet();
      const endur = new Endur(wallet, { apiBaseUrl: "https://app.endur.fi" });

      await expect(
        endur.depositWithReferral(
          {
            asset: "UNKNOWN",
            amount: Amount.parse("100", 18),
            referralCode: "ABC123",
          },
          {}
        )
      ).rejects.toThrow("Unsupported asset");
    });

    it("should throw on decimal mismatch", async () => {
      const wallet = createMockWallet();
      const endur = new Endur(wallet, { apiBaseUrl: "https://app.endur.fi" });

      await expect(
        endur.depositWithReferral(
          {
            asset: "STRK",
            amount: Amount.parse("100", 8),
            referralCode: "ABC123",
          },
          {}
        )
      ).rejects.toThrow("Amount decimals mismatch");
    });
  });

  describe("withdraw", () => {
    it("should call execute with redeem call", async () => {
      const wallet = createMockWallet();
      const endur = new Endur(wallet, { apiBaseUrl: "https://app.endur.fi" });

      const tx = await endur.withdraw(
        { asset: "STRK", amount: Amount.parse("50", 18) },
        {}
      );

      expect(wallet.execute).toHaveBeenCalledTimes(1);
      const [calls] = (wallet.execute as ReturnType<typeof vi.fn>).mock
        .calls[0]!;
      expect(calls).toHaveLength(1);
      expect(calls[0].entrypoint).toBe("redeem");
      expect(tx.hash).toBe("0xmocktxhash");
    });

    it("should throw for unsupported asset", async () => {
      const wallet = createMockWallet();
      const endur = new Endur(wallet, { apiBaseUrl: "https://app.endur.fi" });

      await expect(
        endur.withdraw({ asset: "UNKNOWN", amount: Amount.parse("50", 18) }, {})
      ).rejects.toThrow("Unsupported asset");
    });

    it("should throw on decimal mismatch", async () => {
      const wallet = createMockWallet();
      const endur = new Endur(wallet, { apiBaseUrl: "https://app.endur.fi" });

      await expect(
        endur.withdraw({ asset: "STRK", amount: Amount.parse("50", 8) }, {})
      ).rejects.toThrow("Amount decimals mismatch");
    });
  });
});

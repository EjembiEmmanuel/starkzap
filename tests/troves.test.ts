import { describe, expect, it, vi } from "vitest";
import type { Call, ExecuteOptions } from "starknet";
import { fromAddress } from "@/types";
import { Troves } from "@/troves";
import type { Tx } from "@/tx";

const MOCK_ADDRESS =
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function createMockWallet() {
  const execute = vi.fn<(...args: unknown[]) => Promise<Tx>>();
  execute.mockResolvedValue({ hash: "0xmocktxhash" } as Tx);

  return {
    address: fromAddress(MOCK_ADDRESS),
    execute: execute as (
      calls: Call[],
      options?: ExecuteOptions
    ) => Promise<Tx>,
  };
}

describe("Troves", () => {
  describe("getStrategies", () => {
    it("should fetch strategies from API", async () => {
      const wallet = createMockWallet();
      const strategiesResponse = {
        status: true,
        lastUpdated: new Date().toISOString(),
        source: "database",
        strategies: [
          {
            id: "evergreen_strk",
            name: "Evergreen STRK",
            apy: 0.05,
            apySplit: { baseApy: 0.04, rewardsApy: 0.01 },
            depositToken: [
              {
                symbol: "STRK",
                name: "Starknet",
                address: "0x123",
                decimals: 18,
              },
            ],
            leverage: 1,
            contract: [{ name: "Vault", address: "0xabc" }],
            tvlUsd: 1000000,
            status: { number: 1, value: "active" },
            riskFactor: 0.5,
            isAudited: true,
            assets: ["strk"],
            protocols: ["evergreen"],
            isRetired: false,
          },
        ],
      };

      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(strategiesResponse),
      });

      const troves = new Troves(wallet as never, {
        fetcher: fetcher as typeof fetch,
      });

      const result = await troves.getStrategies();

      expect(fetcher).toHaveBeenCalledWith(
        "https://app.troves.fi/api/strategies",
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
      expect(result.status).toBe(true);
      expect(result.strategies).toHaveLength(1);
      expect(result.strategies[0]?.id).toBe("evergreen_strk");
    });

    it("should append no_cache=true when requested", async () => {
      const wallet = createMockWallet();
      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: true,
            lastUpdated: new Date().toISOString(),
            source: "sdk",
            strategies: [],
          }),
      });

      const troves = new Troves(wallet as never, {
        fetcher: fetcher as typeof fetch,
      });

      await troves.getStrategies({ noCache: true });

      expect(fetcher).toHaveBeenCalledWith(
        "https://app.troves.fi/api/strategies?no_cache=true",
        expect.any(Object)
      );
    });

    it("should throw when API returns non-ok", async () => {
      const wallet = createMockWallet();
      const fetcher = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const troves = new Troves(wallet as never, {
        fetcher: fetcher as typeof fetch,
      });

      await expect(troves.getStrategies()).rejects.toThrow(
        "Troves API failed: 500 Internal Server Error"
      );
    });
  });

  describe("getStats", () => {
    it("should fetch stats from API", async () => {
      const wallet = createMockWallet();
      const statsResponse = {
        tvl: 5000000,
        lastUpdated: new Date().toISOString(),
      };

      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(statsResponse),
      });

      const troves = new Troves(wallet as never, {
        fetcher: fetcher as typeof fetch,
      });

      const result = await troves.getStats();

      expect(fetcher).toHaveBeenCalledWith(
        "https://app.troves.fi/api/stats",
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
      expect(result.tvl).toBe(5000000);
    });
  });

  describe("populateDepositCalls", () => {
    it("should call execute with normalized deposit calls", async () => {
      const wallet = createMockWallet();
      const depositCallsResponse = {
        success: true,
        results: [
          {
            tokenInfo: {
              symbol: "STRK",
              name: "Starknet",
              address: "0x123",
              decimals: 18,
            },
            calls: [
              {
                contractAddress: "0xabc",
                entrypoint: "approve",
                calldata: ["0xdef", "1000000000000000000"],
              },
              {
                contractAddress: "0xdef",
                entrypoint: "deposit",
                calldata: ["1000000000000000000", MOCK_ADDRESS],
              },
            ],
          },
        ],
        strategyId: "evergreen_strk",
        isDeposit: true,
      };

      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(depositCallsResponse),
      });

      const troves = new Troves(wallet as never, {
        fetcher: fetcher as typeof fetch,
      });

      const calls = await troves.populateDepositCalls({
        strategyId: "evergreen_strk",
        amountRaw: "1000000000000000000",
      });

      expect(fetcher).toHaveBeenCalledWith(
        "https://app.troves.fi/api/deposits/calls",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            strategyId: "evergreen_strk",
            amountRaw: "1000000000000000000",
            isDeposit: true,
            address: MOCK_ADDRESS,
          }),
        })
      );
      expect(calls).toHaveLength(2);
      expect(calls[0]).toEqual({
        contractAddress: "0xabc",
        entrypoint: "approve",
        calldata: ["0xdef", "1000000000000000000"],
      });
      expect(calls[1]).toEqual({
        contractAddress: "0xdef",
        entrypoint: "deposit",
        calldata: ["1000000000000000000", MOCK_ADDRESS],
      });
    });

    it("should throw when API returns no calls", async () => {
      const wallet = createMockWallet();
      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            results: [],
            strategyId: "evergreen_strk",
            isDeposit: true,
          }),
      });

      const troves = new Troves(wallet as never, {
        fetcher: fetcher as typeof fetch,
      });

      await expect(
        troves.populateDepositCalls({
          strategyId: "evergreen_strk",
          amountRaw: "1000000000000000000",
        })
      ).rejects.toThrow(
        'Troves deposit API returned no calls for strategy "evergreen_strk"'
      );
    });
  });

  describe("populateWithdrawCalls", () => {
    it("should call API with isDeposit=false and return normalized calls", async () => {
      const wallet = createMockWallet();
      const withdrawCallsResponse = {
        success: true,
        results: [
          {
            tokenInfo: {
              symbol: "STRK",
              name: "Starknet",
              address: "0x123",
              decimals: 18,
            },
            calls: [
              {
                contractAddress: "0xdef",
                entrypoint: "redeem",
                calldata: ["1000000000000000000", MOCK_ADDRESS, MOCK_ADDRESS],
              },
            ],
          },
        ],
        strategyId: "evergreen_strk",
        isDeposit: false,
      };

      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(withdrawCallsResponse),
      });

      const troves = new Troves(wallet as never, {
        fetcher: fetcher as typeof fetch,
      });

      const calls = await troves.populateWithdrawCalls({
        strategyId: "evergreen_strk",
        amountRaw: "1000000000000000000",
      });

      expect(fetcher).toHaveBeenCalledWith(
        "https://app.troves.fi/api/deposits/calls",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            strategyId: "evergreen_strk",
            amountRaw: "1000000000000000000",
            isDeposit: false,
            address: MOCK_ADDRESS,
          }),
        })
      );
      expect(calls).toHaveLength(1);
      expect(calls[0]?.entrypoint).toBe("redeem");
    });
  });

  describe("deposit", () => {
    it("should call execute with approve and deposit calls", async () => {
      const wallet = createMockWallet();
      const depositCallsResponse = {
        success: true,
        results: [
          {
            tokenInfo: {
              symbol: "STRK",
              name: "Starknet",
              address: "0x123",
              decimals: 18,
            },
            calls: [
              {
                contractAddress: "0xabc",
                entrypoint: "approve",
                calldata: ["0xdef", "1000000000000000000"],
              },
              {
                contractAddress: "0xdef",
                entrypoint: "deposit",
                calldata: ["1000000000000000000", MOCK_ADDRESS],
              },
            ],
          },
        ],
        strategyId: "evergreen_strk",
        isDeposit: true,
      };

      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(depositCallsResponse),
      });

      const troves = new Troves(wallet as never, {
        fetcher: fetcher as typeof fetch,
      });

      const tx = await troves.deposit(
        {
          strategyId: "evergreen_strk",
          amountRaw: "1000000000000000000",
        },
        {}
      );

      expect(wallet.execute).toHaveBeenCalledTimes(1);
      const [calls] = (wallet.execute as ReturnType<typeof vi.fn>).mock
        .calls[0]!;
      expect(calls).toHaveLength(2);
      expect(calls[0]?.entrypoint).toBe("approve");
      expect(calls[1]?.entrypoint).toBe("deposit");
      expect(tx.hash).toBe("0xmocktxhash");
    });
  });

  describe("withdraw", () => {
    it("should call execute with withdraw calls", async () => {
      const wallet = createMockWallet();
      const withdrawCallsResponse = {
        success: true,
        results: [
          {
            tokenInfo: {
              symbol: "STRK",
              name: "Starknet",
              address: "0x123",
              decimals: 18,
            },
            calls: [
              {
                contractAddress: "0xdef",
                entrypoint: "redeem",
                calldata: ["1000000000000000000", MOCK_ADDRESS, MOCK_ADDRESS],
              },
            ],
          },
        ],
        strategyId: "evergreen_strk",
        isDeposit: false,
      };

      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(withdrawCallsResponse),
      });

      const troves = new Troves(wallet as never, {
        fetcher: fetcher as typeof fetch,
      });

      const tx = await troves.withdraw(
        {
          strategyId: "evergreen_strk",
          amountRaw: "1000000000000000000",
        },
        {}
      );

      expect(wallet.execute).toHaveBeenCalledTimes(1);
      const [calls] = (wallet.execute as ReturnType<typeof vi.fn>).mock
        .calls[0]!;
      expect(calls).toHaveLength(1);
      expect(calls[0]?.entrypoint).toBe("redeem");
      expect(tx.hash).toBe("0xmocktxhash");
    });
  });
});

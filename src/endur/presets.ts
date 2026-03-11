import type { ChainId } from "@/types/config";

export interface EndurLstConfig {
  readonly symbol: string;
  readonly lstSymbol: string;
  readonly assetAddress: string;
  readonly lstAddress: string;
  readonly decimals: number;
}

const SN_MAIN_LST: Record<string, EndurLstConfig> = {
  STRK: {
    symbol: "STRK",
    lstSymbol: "xSTRK",
    assetAddress:
      "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
    lstAddress:
      "0x028d709c875c0ceac3dce7065bec5328186dc89fe254527084d1689910954b0a",
    decimals: 18,
  },
  WBTC: {
    symbol: "WBTC",
    lstSymbol: "xWBTC",
    assetAddress:
      "0x3fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac",
    lstAddress:
      "0x6a567e68c805323525fe1649adb80b03cddf92c23d2629a6779f54192dffc13",
    decimals: 8,
  },
  tBTC: {
    symbol: "tBTC",
    lstSymbol: "xtBTC",
    assetAddress:
      "0x4daa17763b286d1e59b97c283c0b8c949994c361e426a28f743c67bdfe9a32f",
    lstAddress:
      "0x43a35c1425a0125ef8c171f1a75c6f31ef8648edcc8324b55ce1917db3f9b91",
    decimals: 18,
  },
  LBTC: {
    symbol: "LBTC",
    lstSymbol: "xLBTC",
    assetAddress:
      "0x036834a40984312f7f7de8d31e3f6305b325389eaeea5b1c0664b2fb936461a4",
    lstAddress:
      "0x7dd3c80de9fcc5545f0cb83678826819c79619ed7992cc06ff81fc67cd2efe0",
    decimals: 8,
  },
  solvBTC: {
    symbol: "solvBTC",
    lstSymbol: "xsBTC",
    assetAddress:
      "0x0593e034dda23eea82d2ba9a30960ed42cf4a01502cc2351dc9b9881f9931a68",
    lstAddress:
      "0x580f3dc564a7b82f21d40d404b3842d490ae7205e6ac07b1b7af2b4a5183dc9",
    decimals: 18,
  },
};

const SN_SEPOLIA_LST: Record<string, EndurLstConfig> = {
  STRK: {
    symbol: "STRK",
    lstSymbol: "xSTRK",
    assetAddress:
      "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
    lstAddress:
      "0x042de5b868da876768213c48019b8d46cd484e66013ae3275f8a4b97b31fc7eb",
    decimals: 18,
  },
  TBTC1: {
    symbol: "TBTC1",
    lstSymbol: "xBTC1",
    assetAddress:
      "0x044aD07751Ad782288413C7DB42C48e1c4f6195876BCa3B6CAEF449bb4Fb8d36",
    lstAddress:
      "0x036A2c3C56ae806B12A84bB253cBc1a009e3da5469e6a736C483303B864C8e2B",
    decimals: 8,
  },
  TBTC2: {
    symbol: "TBTC2",
    lstSymbol: "xBTC2",
    assetAddress:
      "0x07E97477601e5606359303cf50C050FD3bA94F66Bd041F4ed504673BA2b81696",
    lstAddress:
      "0x0226324F63D994834E4729dd1bab443fe50Af8E97C608b812ee1f950ceaE68c7",
    decimals: 8,
  },
};

const PRESETS: Record<string, Record<string, EndurLstConfig>> = {
  SN_MAIN: SN_MAIN_LST,
  SN_SEPOLIA: SN_SEPOLIA_LST,
};

/**
 * Get Endur LST configuration for the given chain and asset.
 *
 * @param chainId - The wallet's chain ID
 * @param assetSymbol - Asset symbol (e.g. STRK, WBTC, tBTC)
 * @returns LST config or undefined if not supported
 */
export function getEndurLstConfig(
  chainId: ChainId,
  assetSymbol: string
): EndurLstConfig | undefined {
  const literal = chainId.toLiteral();
  const chainConfig = PRESETS[literal];
  if (!chainConfig) return undefined;

  const normalized = assetSymbol.toLowerCase();
  return Object.values(chainConfig).find(
    (c) => c.symbol.toLowerCase() === normalized
  );
}

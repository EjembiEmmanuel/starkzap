export const LST_ABI = [
  {
    type: "struct",
    name: "core::integer::u256",
    members: [
      { name: "low", type: "core::integer::u128" },
      { name: "high", type: "core::integer::u128" },
    ],
  },
  {
    type: "impl",
    name: "LSTImpl",
    interface_name: "lst::IERC4626",
  },
  {
    type: "interface",
    name: "lst::IERC4626",
    items: [
      {
        type: "function",
        name: "deposit",
        inputs: [
          { name: "assets", type: "core::integer::u256" },
          {
            name: "receiver",
            type: "core::starknet::contract_address::ContractAddress",
          },
        ],
        outputs: [{ type: "core::integer::u256" }],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "redeem",
        inputs: [
          { name: "shares", type: "core::integer::u256" },
          {
            name: "receiver",
            type: "core::starknet::contract_address::ContractAddress",
          },
          {
            name: "owner",
            type: "core::starknet::contract_address::ContractAddress",
          },
        ],
        outputs: [{ type: "core::integer::u256" }],
        state_mutability: "external",
      },
    ],
  },
] as const;

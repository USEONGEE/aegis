// Hyperliquid EVM tokens (chainId: 999) — ported from HypurrQuant_FE

import type { TokenInfo } from './types.js'

// --- Native / Wrapped ---
export const HL_WHYPE: TokenInfo = { chainId: 999, address: '0x5555555555555555555555555555555555555555', decimals: 18, symbol: 'WHYPE', name: null }
export const HL_KHYPE: TokenInfo = { chainId: 999, address: '0xfD739d4e423301CE9385c1fb8850539D657C296D', decimals: 18, symbol: 'kHYPE', name: null }
export const HL_LHYPE: TokenInfo = { chainId: 999, address: '0x5748ae796AE46A4F1348a1693de4b50560485562', decimals: 18, symbol: 'LHYPE', name: null }

// --- Stablecoins ---
export const HL_USDC: TokenInfo = { chainId: 999, address: '0xb88339CB7199b77E23DB6E890353E22632Ba630f', decimals: 6, symbol: 'USDC', name: null }
export const HL_USDT: TokenInfo = { chainId: 999, address: '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb', decimals: 6, symbol: 'USD₮0', name: null }
export const HL_USDH: TokenInfo = { chainId: 999, address: '0x111111a1a0667d36bD57c0A9f569b98057111111', decimals: 6, symbol: 'USDH', name: null }
export const HL_USDHL: TokenInfo = { chainId: 999, address: '0xb50A96253aBDF803D85efcDce07Ad8becBc52BD5', decimals: 6, symbol: 'USDHL', name: null }

// --- Special decimals ---
export const HL_UBTC: TokenInfo = { chainId: 999, address: '0x9FDBdA0A5e284c32744D2f17Ee5c74B284993463', decimals: 8, symbol: 'UBTC', name: null }
export const HL_USOL: TokenInfo = { chainId: 999, address: '0x068f321Fa8Fb9f0D135f290Ef6a3e2813e1c8A29', decimals: 9, symbol: 'USOL', name: null }
export const HL_UETH: TokenInfo = { chainId: 999, address: '0xBe6727B535545C67d5cAa73dEa54865B92CF7907', decimals: 18, symbol: 'UETH', name: null }

// --- DEX Tokens ---
export const HL_KITTEN: TokenInfo = { chainId: 999, address: '0x618275F8EFE54c2afa87bfB9F210A52F0fF89364', decimals: 18, symbol: 'KITTEN', name: null }
export const HL_RAM: TokenInfo = { chainId: 999, address: '0x555570a286F15EbDFE42B66eDE2f724Aa1AB5555', decimals: 18, symbol: 'RAM', name: null }
export const HL_HYBR: TokenInfo = { chainId: 999, address: '0x067b0C72aa4C6Bd3BFEFfF443c536DCd6a25a9C8', decimals: 18, symbol: 'HYBR', name: null }
export const HL_NEST: TokenInfo = { chainId: 999, address: '0x07c57E32a3C29D5659bda1d3EFC2E7BF004E3035', decimals: 18, symbol: 'NEST', name: null }
export const HL_SOLID: TokenInfo = { chainId: 999, address: '0xae60eAfb73Eb0516951ab20089Cff32AC9DC63b7', decimals: 18, symbol: 'US', name: 'UltraSolid' }

// --- Other ---
export const HL_PURR: TokenInfo = { chainId: 999, address: '0x9b498C3c8A0b8CD8BA1D9851d40D186F1872b44E', decimals: 18, symbol: 'PURR', name: null }
export const HL_UPUMP: TokenInfo = { chainId: 999, address: '0x27eC642013bcB3D80CA3706599D3cdA04F6f4452', decimals: 6, symbol: 'UPUMP', name: null }
export const HL_UXPL: TokenInfo = { chainId: 999, address: '0x33af3c2540ba72054e044efe504867b39ae421f5', decimals: 18, symbol: 'UXPL', name: null }
export const HL_HSTR: TokenInfo = { chainId: 999, address: '0x3FA145caD2C8108A68cfc803A8e1aE246C36dF3e', decimals: 18, symbol: 'HSTR', name: null }

// --- vfat tokens ---
export const HL_WHLP: TokenInfo = { chainId: 999, address: '0x1359b05241ca5076c9f59605214f4f84114c0de8', decimals: 6, symbol: 'WHLP', name: 'Wrapped HLP' }
export const HL_BUDDY: TokenInfo = { chainId: 999, address: '0x47bb061c0204af921f43dc73c7d7768d2672ddee', decimals: 6, symbol: 'BUDDY', name: 'alright buddy' }
export const HL_CAT: TokenInfo = { chainId: 999, address: '0x04d02cb2e963b4490ee02b1925223d04f9d83fc6', decimals: 18, symbol: 'CAT', name: 'CAT' }
export const HL_CATBAL: TokenInfo = { chainId: 999, address: '0x11735dbd0b97cfa7accf47d005673ba185f7fd49', decimals: 18, symbol: 'CATBAL', name: 'CATBAL' }
export const HL_CMETH: TokenInfo = { chainId: 999, address: '0xe6829d9a7ee3040e1276fa75293bde931859e8fa', decimals: 18, symbol: 'cmETH', name: 'cmETH' }
export const HL_FEUSD: TokenInfo = { chainId: 999, address: '0x02c6a2fa58cc01a18b8d9e00ea48d65e4df26c70', decimals: 18, symbol: 'feUSD', name: 'feUSD' }
export const HL_GENESY: TokenInfo = { chainId: 999, address: '0x6f7e96c0267cd22fe04346af21f8c6ff54372939', decimals: 18, symbol: 'GENESY', name: 'GENESY' }
export const HL_HBHYPE: TokenInfo = { chainId: 999, address: '0x96c6cbb6251ee1c257b2162ca0f39aa5fa44b1fb', decimals: 18, symbol: 'hbHYPE', name: 'Hyperbeat Ultra HYPE' }
export const HL_HBUSDT: TokenInfo = { chainId: 999, address: '0x5e105266db42f78fa814322bce7f388b4c2e61eb', decimals: 18, symbol: 'hbUSDT', name: 'Hyperbeat USDT' }
export const HL_HFUN: TokenInfo = { chainId: 999, address: '0xa320d9f65ec992eff38622c63627856382db726c', decimals: 18, symbol: 'HFUN', name: 'HFUN' }
export const HL_HUSDT0_RWA: TokenInfo = { chainId: 999, address: '0x7410e69958a8ece2a51c231c8528513d4d668c7a', decimals: 6, symbol: 'hUSDT0-RWA', name: 'USDT0 Hyperliquid-RWA Strategies' }
export const HL_HYPERRAM: TokenInfo = { chainId: 999, address: '0x5555c2542836e7a6c8d3e133d5aa9773b65d5555', decimals: 18, symbol: 'hyperRAM', name: 'xRAM Liquid Staking Token' }
export const HL_JEFF: TokenInfo = { chainId: 999, address: '0x52e444545fbe9e5972a7a371299522f7871aec1f', decimals: 18, symbol: 'JEFF', name: 'JEFF' }
export const HL_KEI: TokenInfo = { chainId: 999, address: '0xb5fe77d323d69eb352a02006ea8ecc38d882620c', decimals: 18, symbol: 'KEI', name: 'KEI Stablecoin' }
export const HL_KNTQ: TokenInfo = { chainId: 999, address: '0x000000000000780555bd0bca3791f89f9542c2d6', decimals: 18, symbol: 'KNTQ', name: 'Kinetiq Governance Token' }
export const HL_LIQD: TokenInfo = { chainId: 999, address: '0x1ecd15865d7f8019d546f76d095d9c93cc34edfa', decimals: 18, symbol: 'LIQD', name: 'LiquidLaunch' }
export const HL_LOOP: TokenInfo = { chainId: 999, address: '0x00fdbc53719604d924226215bc871d55e40a1009', decimals: 18, symbol: 'LOOP', name: 'Looping Collective' }
export const HL_MHYPE: TokenInfo = { chainId: 999, address: '0xdabb040c428436d41cecd0fb06bcfdbaad3a9aa8', decimals: 18, symbol: 'mHYPE', name: 'Hyperpie Staked mHYPE' }
export const HL_MILK: TokenInfo = { chainId: 999, address: '0xfe69bc93b936b34d371defa873686c116c8488c2', decimals: 6, symbol: 'MILK', name: 'SUPERMILK' }
export const HL_PIP: TokenInfo = { chainId: 999, address: '0x1bee6762f0b522c606dc2ffb106c0bb391b2e309', decimals: 18, symbol: 'PiP', name: 'PiP' }
export const HL_RUB: TokenInfo = { chainId: 999, address: '0x7dcffcb06b40344eeced2d1cbf096b299fe4b405', decimals: 18, symbol: 'RUB', name: 'RUB' }
export const HL_STHYPE: TokenInfo = { chainId: 999, address: '0xffaa4a3d97fe9107cef8a3f48c069f577ff76cc1', decimals: 18, symbol: 'stHYPE', name: 'Staked HYPE' }
export const HL_STLOOP: TokenInfo = { chainId: 999, address: '0x502ee789b448aa692901fe27ab03174c90f07dd1', decimals: 18, symbol: 'stLOOP', name: 'Staked LOOP' }
export const HL_UFART: TokenInfo = { chainId: 999, address: '0x3b4575e689ded21caad31d64c4df1f10f3b2cedf', decimals: 6, symbol: 'UFART', name: 'Unit Fartcoin' }
export const HL_USDE: TokenInfo = { chainId: 999, address: '0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34', decimals: 18, symbol: 'USDe', name: 'USDeOFT' }
export const HL_USDXL: TokenInfo = { chainId: 999, address: '0xca79db4b49f608ef54a5cb813fbed3a6387bc645', decimals: 18, symbol: 'USDXL', name: 'Last USD' }
export const HL_USR: TokenInfo = { chainId: 999, address: '0x0ad339d66bf4aed5ce31c64bc37b3244b6394a77', decimals: 18, symbol: 'USR', name: 'Resolv USD' }
export const HL_VEGAS: TokenInfo = { chainId: 999, address: '0xb09158c8297acee00b900dc1f8715df46b7246a6', decimals: 18, symbol: 'VEGAS', name: 'Vegas' }
export const HL_VKHYPE: TokenInfo = { chainId: 999, address: '0x9ba2edc44e0a4632eb4723e81d4142353e1bb160', decimals: 18, symbol: 'vkHYPE', name: 'Kinetiq Earn Vault' }
export const HL_WSTHYPE: TokenInfo = { chainId: 999, address: '0x94e8396e0869c9f2200760af0621afd240e1cf38', decimals: 18, symbol: 'wstHYPE', name: 'Staked HYPE Shares' }
export const HL_XAUT0: TokenInfo = { chainId: 999, address: '0xf4d9235269a96aadafc9adae454a0618ebe37949', decimals: 6, symbol: 'XAUt0', name: 'XAUt0' }
export const HL_XHYPE: TokenInfo = { chainId: 999, address: '0xac962fa04bf91b7fd0dc0c5c32414e0ce3c51e03', decimals: 18, symbol: 'xHYPE', name: 'xHYPE' }

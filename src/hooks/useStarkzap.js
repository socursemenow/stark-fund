// ─────────────────────────────────────────────────────────
// src/hooks/useStarkzap.js
// Starkzap SDK — matches official docs exactly
// ─────────────────────────────────────────────────────────
import {
  StarkZap,
  OnboardStrategy,
  Amount,
  fromAddress,
  getPresets,
  sepoliaTokens,
  mainnetTokens,
  AvnuSwapProvider,
  EkuboSwapProvider,
} from "starkzap";

const NETWORK = import.meta.env.VITE_NETWORK || "sepolia";

// Voyager explorer URL — used across the app
export const VOYAGER_URL = NETWORK === "mainnet"
  ? "https://voyager.online"
  : "https://sepolia.voyager.online";

let sdkInstance = null;

export function getSDK() {
  if (!sdkInstance) {
    sdkInstance = new StarkZap({ network: NETWORK });
  }
  return sdkInstance;
}

export function useStarkzap() {
  return { sdk: getSDK(), network: NETWORK };
}

// Get tokens for connected wallet's chain
export function getTokenPresets(wallet) {
  try {
    return getPresets(wallet.getChainId());
  } catch (err) {
    console.warn("getPresets failed, using direct imports:", err.message);
    // Fallback to direct imports
    return NETWORK === "mainnet" ? mainnetTokens : sepoliaTokens;
  }
}

// Direct token access for policies etc.
export const tokens = NETWORK === "mainnet" ? mainnetTokens : sepoliaTokens;

// Helper: format bigint base amount to human readable string
// Handles: zero, very small amounts, large amounts
export function formatBase(base, token) {
  if (!base || base === 0n) return "0";
  const decimals = token?.decimals || 18;
  const isNeg = base < 0n;
  const abs = isNeg ? -base : base;
  const str = abs.toString().padStart(decimals + 1, "0");
  const whole = str.slice(0, -decimals) || "0";
  const frac = str.slice(-decimals).replace(/0+$/, "");
  const result = frac ? `${whole}.${frac.slice(0, 8)}` : whole;
  return isNeg ? `-${result}` : result;
}

// Helper: get Voyager tx URL
export function getExplorerUrl(txHashOrUrl) {
  if (!txHashOrUrl) return null;
  if (txHashOrUrl.startsWith("http")) return txHashOrUrl;
  return `${VOYAGER_URL}/tx/${txHashOrUrl}`;
}

export { Amount, fromAddress, OnboardStrategy, getPresets, sepoliaTokens, mainnetTokens, AvnuSwapProvider, EkuboSwapProvider };
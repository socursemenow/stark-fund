// ═══════════════════════════════════════════════════════════
// src/hooks/useCampaigns.js — Real API + local fallback
// FIXED: retries backend check if it previously failed
// ═══════════════════════════════════════════════════════════

import { create } from "zustand";
import { api } from "../lib/api";

// Check if backend is running — retries if previously failed
let backendAvailable = null;
let lastCheck = 0;
const RETRY_INTERVAL = 30000; // retry every 30 seconds if failed

async function checkBackend() {
  const now = Date.now();
  // If previously succeeded, keep it
  if (backendAvailable === true) return true;
  // If previously failed, retry after interval
  if (backendAvailable === false && (now - lastCheck) < RETRY_INTERVAL) return false;

  lastCheck = now;
  try {
    const url = import.meta.env.VITE_API_URL || "";
    const res = await fetch(`${url}/api/health`);
    if (res.ok) {
      backendAvailable = true;
      console.log("[useCampaigns] Backend connected:", url);
    } else {
      backendAvailable = false;
    }
  } catch {
    backendAvailable = false;
    console.warn("[useCampaigns] Backend unavailable, using local state");
  }
  return backendAvailable;
}

export const useCampaignStore = create((set, get) => ({
  campaigns: [],
  loading: false,
  error: null,
  initialized: false,

  setCampaigns: (campaigns) => set({ campaigns }),
  setLoading: (loading) => set({ loading }),

  // ── Fetch all campaigns ──
  fetchCampaigns: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const hasBackend = await checkBackend();
      if (hasBackend) {
        const data = await api.getCampaigns();
        set({ campaigns: data, loading: false, initialized: true });
      } else {
        set({ loading: false, initialized: true });
      }
    } catch (err) {
      console.warn("API fetch failed, using local data:", err.message);
      set({ loading: false, initialized: true });
    }
  },

  // ── Create campaign ──
  addCampaign: async (campaign) => {
    try {
      const hasBackend = await checkBackend();
      let created;

      if (hasBackend) {
        created = await api.createCampaign(campaign);
      } else {
        created = {
          ...campaign,
          id: `c_${Date.now()}`,
          raised: 0,
          backers: [],
          created_at: new Date().toISOString(),
          staked: false,
          yield_earned: 0,
          refunded: false,
        };
      }

      set({ campaigns: [created, ...get().campaigns] });
      return created;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  // ── Record a contribution ──
  recordFund: async (campaignId, contribution) => {
    try {
      const hasBackend = await checkBackend();

      if (hasBackend) {
        const updated = await api.recordContribution(campaignId, {
          backer_address: contribution.address || contribution.backer_address,
          amount: contribution.amount,
          token_paid: contribution.token_paid || "STRK",
          amount_paid: contribution.amount_paid || contribution.amount,
          tx_hash: contribution.tx_hash || "",
        });
        // Replace campaign in state with server response (has updated raised + backers)
        set({
          campaigns: get().campaigns.map((c) =>
            c.id === campaignId ? updated : c
          ),
        });
        return updated;
      } else {
        // Local update
        const localContrib = {
          backer_address: contribution.address || contribution.backer_address,
          address: contribution.address || contribution.backer_address,
          amount: contribution.amount,
          tx_hash: contribution.tx_hash || "",
          token_paid: contribution.token_paid || "STRK",
          created_at: new Date().toISOString(),
          date: new Date().toISOString(),
        };
        set({
          campaigns: get().campaigns.map((c) =>
            c.id === campaignId
              ? {
                  ...c,
                  raised: (c.raised || 0) + contribution.amount,
                  backers: [...(c.backers || []), localContrib],
                }
              : c
          ),
        });
      }
    } catch (err) {
      console.warn("recordFund API failed, updating locally:", err.message);
      // Still update locally on API failure
      const localContrib = {
        backer_address: contribution.address || contribution.backer_address,
        address: contribution.address || contribution.backer_address,
        amount: contribution.amount,
        tx_hash: contribution.tx_hash || "",
        created_at: new Date().toISOString(),
        date: new Date().toISOString(),
      };
      set({
        campaigns: get().campaigns.map((c) =>
          c.id === campaignId
            ? {
                ...c,
                raised: (c.raised || 0) + contribution.amount,
                backers: [...(c.backers || []), localContrib],
              }
            : c
        ),
      });
    }
  },

  // ── Mark campaign as refunded ──
  markRefunded: async (campaignId, data) => {
    try {
      const hasBackend = await checkBackend();
      if (hasBackend) {
        await api.refundCampaign(campaignId, data);
      }
    } catch (err) {
      console.warn("API refund failed:", err.message);
    }

    set({
      campaigns: get().campaigns.map((c) =>
        c.id === campaignId
          ? {
              ...c,
              refunded: true,
              refunded_at: new Date().toISOString(),
              backers: (c.backers || []).map((b) => ({ ...b, refunded: true })),
            }
          : c
      ),
    });
  },

  // ── Mark campaign as staked ──
  markStaked: async (campaignId, txHash) => {
    try {
      const hasBackend = await checkBackend();
      if (hasBackend) {
        await api.recordStake(campaignId, { tx_hash: txHash });
      }
    } catch (err) {
      console.warn("API stake record failed:", err.message);
    }

    set({
      campaigns: get().campaigns.map((c) =>
        c.id === campaignId ? { ...c, staked: true } : c
      ),
    });
  },
}));
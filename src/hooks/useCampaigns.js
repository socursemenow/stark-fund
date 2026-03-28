// ═══════════════════════════════════════════════════════════
// src/hooks/useCampaigns.js — Real API + local fallback
// ═══════════════════════════════════════════════════════════

import { create } from "zustand";
import { api } from "../lib/api";

// Check if backend is running
let backendAvailable = null;
async function checkBackend() {
  if (backendAvailable !== null) return backendAvailable;
  try {
    await fetch(`${import.meta.env.VITE_API_URL || ""}/api/health`);
    backendAvailable = true;
  } catch {
    backendAvailable = false;
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
        // No backend — keep local state
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
        // Local fallback
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
          backer_address: contribution.address,
          amount: contribution.amount,
          token_paid: contribution.token_paid || "STRK",
          amount_paid: contribution.amount_paid || contribution.amount,
          tx_hash: contribution.tx_hash || "",
        });
        // Replace campaign in state with server response
        set({
          campaigns: get().campaigns.map((c) =>
            c.id === campaignId ? updated : c
          ),
        });
      } else {
        // Local update
        set({
          campaigns: get().campaigns.map((c) =>
            c.id === campaignId
              ? {
                  ...c,
                  raised: c.raised + contribution.amount,
                  backers: [
                    ...c.backers,
                    {
                      address: contribution.address,
                      amount: contribution.amount,
                      tx_hash: contribution.tx_hash,
                      date: new Date().toISOString(),
                    },
                  ],
                }
              : c
          ),
        });
      }
    } catch (err) {
      // Still update locally on API failure
      set({
        campaigns: get().campaigns.map((c) =>
          c.id === campaignId
            ? {
                ...c,
                raised: c.raised + contribution.amount,
                backers: [
                  ...c.backers,
                  {
                    address: contribution.address,
                    amount: contribution.amount,
                    tx_hash: contribution.tx_hash,
                    date: new Date().toISOString(),
                  },
                ],
              }
            : c
        ),
      });
    }
  },

  // ── Mark campaign as refunded ──
  markRefunded: async (campaignId) => {
    try {
      const hasBackend = await checkBackend();
      if (hasBackend) {
        await api.refundCampaign(campaignId);
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
              backers: c.backers.map((b) => ({ ...b, refunded: true })),
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
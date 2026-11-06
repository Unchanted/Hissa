import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { MarketRecord } from "./demo-data";

export type Listing = {
  listingId: string;
  entityKey: string;
  txHash: string;
  expiresAt: string;
  version: number;
  consentSale: boolean;
  consentContact: boolean;
  expiryDays: number;
  publishedAt: number;
  live: boolean;
  domain?: string;
  region?: string;
};

export type ReceiptKind = "listing" | "consent" | "revoke" | "sale" | "contact" | "payout" | "inference" | "report";
export type Receipt = {
  id: string;
  kind: ReceiptKind;
  title: string;
  chain: "arkiv" | "hedera" | "0g";
  tx: string;
  amount?: number;
  at: number;
  /** HashScan link when the payment is real. */
  href?: string;
  arkivEntityKey?: string;
};

export type Contact = { listingId: string; paymentTx: string; href?: string; message: string; reply: "pending" | "interested" | "ignored"; at: number };

export type State = {
  /** The most recent listing (kept for readers that only need one). */
  listing: Listing | null;
  /** Every listing this seller has published, oldest first. */
  listings: Listing[];
  receipts: Receipt[];
  earnings: { sales: number; contacts: number; paid: number };
  spent: number;
  hcsSeq: number;
  bought: (MarketRecord & { paymentTx: string; href?: string })[];
  contact: Contact | null;
};

const initial = (): State => ({
  listing: null,
  listings: [],
  receipts: [],
  earnings: { sales: 0, contacts: 0, paid: 0 },
  spent: 0,
  hcsSeq: 13,
  bought: [],
  contact: null,
});

/** Sets the listings and keeps `listing` pointing at the most recent one. */
export function withListings(s: State, listings: Listing[]): State {
  return { ...s, listings, listing: listings[listings.length - 1] ?? null };
}

/** Applies a change to one listing, by id. */
export function patchListingState(s: State, listingId: string, change: Partial<Listing>): State {
  return withListings(s, s.listings.map((l) => (l.listingId === listingId ? { ...l, ...change } : l)));
}

const KEY = "hissa.arkiv.v4";
function load(): State {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      const s = { ...initial(), ...(JSON.parse(raw) as State) };
      if (!Array.isArray(s.listings)) s.listings = [];
      if (!s.listings.length && s.listing) s.listings = [s.listing];
      return withListings(s, s.listings);
    }
  } catch {
    /* storage unavailable: start fresh */
  }
  return initial();
}

type Ctx = {
  state: State;
  update: (fn: (s: State) => State) => void;
  addReceipt: (r: Omit<Receipt, "id" | "at">) => void;
  reset: () => void;
};
const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(load);

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);

  const update = useCallback((fn: (s: State) => State) => setState(fn), []);
  const addReceipt = useCallback(
    (r: Omit<Receipt, "id" | "at">) =>
      setState((s) => ({ ...s, receipts: [...s.receipts, { ...r, id: Math.random().toString(36).slice(2), at: Date.now() }] })),
    [],
  );
  const reset = useCallback(() => {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    setState(initial());
  }, []);

  return <StoreCtx.Provider value={{ state, update, addReceipt, reset }}>{children}</StoreCtx.Provider>;
}

export function useStore(): Ctx {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("useStore outside provider");
  return c;
}

export const pendingEarnings = (s: State) => s.earnings.sales + s.earnings.contacts - s.earnings.paid;

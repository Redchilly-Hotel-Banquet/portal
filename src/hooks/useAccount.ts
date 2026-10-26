"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/apiClient";
import { USER_SESSION_EVENT, getUserAccount, type UserAccount } from "@/lib/userSession";

export type SavedSummary = {
  documentType: string | null;
  documentLast4: string | null;
  hasDocumentImage: boolean;
  hasSignature: boolean;
};

export type Profile = {
  id: string;
  email: string | null;
  name: string;
  phone: string | null;
  picture: string | null;
  roles: string[];
  outlets: string[];
  saved: SavedSummary;
  /** Earlier bookings that were just added to this account through its phone number. Only sent after a save. */
  linkedBookings?: number;
};

/** Saved ID and signature, returned only to their owner for autofill. */
export type SavedDetails = {
  documentType: string;
  documentNumber: string;
  documentImageDataUrl: string;
  signatureDataUrl: string;
  updatedAt: string | null;
};

let providersRequest: Promise<boolean> | null = null;

/** True once the server reports Google sign-in is configured. Always false until then. */
export function useGoogleEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    providersRequest ??= apiGet<{ google?: boolean }>("/auth/providers")
      .then((res) => res?.google === true)
      .catch(() => {
        providersRequest = null;
        return false;
      });
    void providersRequest.then((value) => active && setEnabled(value));
    return () => {
      active = false;
    };
  }, []);
  return enabled;
}

/** The signed-in account from local storage. `undefined` until the first client read. */
export function useAccount(): UserAccount | null | undefined {
  const [account, setAccount] = useState<UserAccount | null | undefined>(undefined);

  useEffect(() => {
    const sync = () => setAccount(getUserAccount());
    sync();
    window.addEventListener(USER_SESSION_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(USER_SESSION_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return account;
}

/**
 * Loads the saved profile of the signed-in user for autofill. `profile` stays null for
 * signed-out visitors; `save` quietly stores details entered in a form for next time.
 */
export function useProfile() {
  const account = useAccount();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const accountId = account?.id;

  useEffect(() => {
    if (!accountId) {
      setProfile(null);
      return;
    }
    let active = true;
    setLoading(true);
    apiGet<{ profile: Profile }>("/me", "user")
      .then((res) => active && setProfile(res.profile))
      .catch(() => active && setProfile(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [accountId]);

  const save = useCallback(
    async (details: { name?: string; phone?: string }) => {
      if (!accountId) return;
      const clean: { name?: string; phone?: string } = {};
      if (details.name?.trim()) clean.name = details.name.trim();
      if (details.phone?.trim()) clean.phone = details.phone.trim();
      if (!clean.name && !clean.phone) return;
      try {
        const res = await apiPost<{ profile: Profile }>("/me", clean, "user");
        setProfile(res.profile);
      } catch {
        /* Saving is a convenience; never interrupt the form that triggered it. */
      }
    },
    [accountId],
  );

  return { account, profile, loading, save };
}

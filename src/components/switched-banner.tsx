"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ADMIN_STORAGE_KEYS, syncAdminSessionFromShared } from "@/lib/authSession";
import { getUserAccount } from "@/lib/userSession";
import { SWITCH_EVENT, isSwitched, switchBack } from "@/lib/impersonation";

/** Shown on every page while the super-owner is signed in as someone else. */
export function SwitchedBanner() {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setName(isSwitched() ? (getUserAccount()?.email ?? getUserAccount()?.name ?? "another account") : null);
    update();
    window.addEventListener(SWITCH_EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(SWITCH_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);

  // Other open tabs: when the account is switched, switched back or signed out in one tab, the rest follow.
  useEffect(() => {
    const WATCHED = [...ADMIN_STORAGE_KEYS, "userJwt", "userAccount", "rcSwitchedFrom"];
    let timer: number | undefined;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && !WATCHED.includes(event.key)) return;
      // A switch writes several keys in a row; reload once, after the last.
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        syncAdminSessionFromShared();
        window.location.reload();
      }, 200);
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearTimeout(timer);
    };
  }, []);

  if (!name) return null;
  return (
    <div role="status" className="fixed inset-x-0 bottom-0 z-[60] flex flex-wrap items-center justify-center gap-3 border-t border-border bg-foreground px-4 py-2 text-sm text-background">
      <span>You are signed in as {name}.</span>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          switchBack();
          // A full load, so nothing fetched as the other account stays on screen.
          window.location.assign("/admin/access");
        }}
      >
        Switch back
      </Button>
    </div>
  );
}

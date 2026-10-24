"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { saveAdminSession } from "@/lib/authSession";
import { saveUserSession, type UserAccount } from "@/lib/userSession";

type Session = { token: string; user: UserAccount };

const MESSAGES: Record<string, string> = {
  google_disabled: "Google sign-in is not enabled for this property.",
  google_cancelled: "Google sign-in was cancelled. Please try again.",
  google_unverified: "That Google account's email address is not verified.",
  account_inactive: "This account has been deactivated. Contact the front desk.",
  google_failed: "Google sign-in could not be completed. Please try again.",
};

const safeNext = (value: string | null) => (value && /^\/(?!\/)[^\\\s]*$/.test(value) ? value : "/");

const decodeSession = (value: string | null): Session | null => {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4)), (c) => c.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<Session> | null;
    const user = parsed?.user;
    if (!parsed || typeof parsed.token !== "string" || !user || typeof user.id !== "string" || !Array.isArray(user.roles)) {
      return null;
    }
    return { token: parsed.token, user: user as UserAccount };
  } catch {
    return null;
  }
};

export default function AuthCompletePage() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    window.history.replaceState(null, "", window.location.pathname);
    const next = safeNext(params.get("next"));
    const wantsStaff = next.startsWith("/admin");

    const error = params.get("error");
    const session = error ? null : decodeSession(params.get("session"));
    if (!session) {
      const code = error && MESSAGES[error] ? error : "google_failed";
      if (wantsStaff) {
        router.replace(`/admin/login?error=${code}`);
      } else {
        toast.error(MESSAGES[code], params.get("detail") ? { description: params.get("detail") ?? undefined } : undefined);
        router.replace(next);
      }
      return;
    }

    saveUserSession(session.token, session.user);
    const isStaff = session.user.roles.length > 0;
    if (isStaff) saveAdminSession(session.token, session.user);

    if (wantsStaff && !isStaff) {
      router.replace("/admin/login?error=no_staff_access");
      return;
    }
    toast.success(`Signed in as ${session.user.name}`);
    router.replace(next);
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <p role="status" className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" strokeWidth={1.75} aria-hidden />
        Signing you in
      </p>
    </main>
  );
}

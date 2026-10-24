"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError, apiGet, apiPost } from "@/lib/apiClient";
import { isAdminAuthenticated, saveAdminSession, type AdminUser } from "@/lib/authSession";
import { SITE } from "@/components/site/site-config";
import { GoogleIcon } from "./google-icon";

type LoginResponse = { token: string; user: AdminUser };
type LoginBody = { userName: string; password: string };

const GOOGLE_ERRORS: Record<string, string> = {
  google_disabled: "Google sign-in is not enabled for this property.",
  google_cancelled: "Google sign-in was cancelled. Please try again.",
  google_unverified: "That Google account's email address is not verified.",
  no_staff_access: "This Google account does not have staff access yet. Ask an administrator to assign you a role (admin, kitchen or rooms).",
  account_inactive: "This account has been deactivated. Ask an administrator to reactivate it.",
  google_failed: "Google sign-in could not be completed. Please try again or use your password.",
};

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorCode = searchParams.get("error");

  const [userName, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  const queryError = errorCode ? GOOGLE_ERRORS[errorCode] ?? null : null;
  const error = formError ?? queryError;

  useEffect(() => {
    if (isAdminAuthenticated()) router.replace("/admin/dashboard");
  }, [router]);

  useEffect(() => {
    let active = true;
    apiGet<{ google?: boolean }>("/auth/providers")
      .then((res) => {
        if (active && res?.google === true) setGoogleEnabled(true);
      })
      .catch(() => {
        /* providers unavailable: password sign-in only */
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const data = await apiPost<LoginResponse, LoginBody>("/auth/login", {
        userName: userName.trim(),
        password,
      });
      saveAdminSession(data.token, data.user);
      router.replace("/admin/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setFormError("Incorrect username or password.");
      } else if (err instanceof ApiError || err instanceof Error) {
        setFormError(err.message || "Sign-in failed. Please try again.");
      } else {
        setFormError("Sign-in failed. Please try again.");
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="hidden flex-col justify-between border-r border-border bg-surface p-12 lg:flex">
        <div className="flex items-center gap-3">
          <Image src="/logo.jpeg" alt="" width={44} height={44} className="h-11 w-11 rounded-sm object-cover" priority />
          <p className="font-display text-xl text-foreground">{SITE.name}</p>
        </div>
        <div>
          <span className="block h-px w-12 bg-brass" aria-hidden />
          <p className="eyebrow mt-6">Staff portal</p>
          <p className="mt-3 max-w-sm font-display text-3xl leading-tight text-foreground">
            Orders, bookings and rooms for {SITE.name}.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">{SITE.address}</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Image src="/logo.jpeg" alt="" width={36} height={36} className="h-9 w-9 rounded-sm object-cover" priority />
            <p className="font-display text-lg text-foreground">{SITE.name}</p>
          </div>

          <p className="eyebrow">Staff portal</p>
          <h1 className="mt-2 text-3xl text-foreground">Sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">Use the credentials issued by your administrator.</p>

          {error ? (
            <Alert variant="destructive" className="mt-6" role="alert">
              <AlertCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate={false}>
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                required
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  className="pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  ) : (
                    <Eye className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  )}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
              {submitting ? "Signing in" : "Sign in"}
            </Button>
          </form>

          {googleEnabled ? (
            <>
              <div className="my-6 flex items-center gap-3" role="separator" aria-label="or">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs uppercase tracking-wider text-muted-foreground">or</span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  window.location.href = "/api/auth/google?next=/admin/dashboard";
                }}
                className="inline-flex h-10 w-full items-center justify-center gap-3 rounded-md border border-[#dadce0] bg-white px-4 text-sm font-medium text-[#3c4043] transition-colors hover:bg-[#f8f9fa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-60"
              >
                <GoogleIcon className="h-[18px] w-[18px]" />
                Continue with Google
              </button>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}

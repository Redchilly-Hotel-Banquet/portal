"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiPost } from "@/lib/apiClient";
import type { Profile } from "@/hooks/useAccount";
import { profileKeys, useMyProfile } from "./queries";

export function DetailsForm() {
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useMyProfile(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setPhone(profile.phone ?? "");
    }
  }, [profile]);

  const save = useMutation({
    mutationFn: () => apiPost<{ profile: Profile }>("/me", { name, phone }, "user"),
    onSuccess: (res) => {
      queryClient.setQueryData(profileKeys.profile, res.profile);
      toast.success("Profile updated");
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not update your profile"),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <form onSubmit={onSubmit} className="space-y-5 rounded-md border border-border bg-card p-5" aria-labelledby="details-title">
      <div>
        <p className="eyebrow">Account</p>
        <h2 id="details-title" className="mt-2 text-xl">
          Your details
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Used to prefill booking, banquet and contact forms.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="profile-name">Full name</Label>
        <Input id="profile-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="profile-email">Email</Label>
        <Input id="profile-email" value={profile?.email ?? ""} readOnly className="bg-muted/60 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">From your Google account. It cannot be changed here.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="profile-phone">Phone</Label>
        <Input
          id="profile-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+91 9XXXXXXXXX"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={save.isPending || !name.trim()}>
        {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
        Save details
      </Button>
    </form>
  );
}

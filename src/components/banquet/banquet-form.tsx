"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useProfile } from "@/hooks/useAccount";
import { useQuery } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { apiPost } from "@/lib/apiClient";
import { SITE } from "@/components/site/site-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type BranchesResponse = {
  outlet: { id: string; name?: string | null; location_key?: string | null }[];
};

const Required = () => (
  <span className="text-destructive" aria-hidden>
    {" "}
    *
  </span>
);

export function BanquetForm() {
  const { data, isLoading, isError, error } = useQuery<BranchesResponse>({
    queryKey: ["banquet-outlets"],
    queryFn: () => apiPost<BranchesResponse, Record<string, never>>("/public/locations/validate", {}),
    staleTime: 10 * 60 * 1000,
    retry: (count) => count < 2,
  });

  const branches = useMemo(
    () => (data?.outlet ?? []).filter((b): b is typeof b & { location_key: string } => Boolean(b.location_key)),
    [data],
  );

  const [branchKey, setBranchKey] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [date, setDate] = useState("");
  const [timeSlot, setTimeSlot] = useState("");
  const [guests, setGuests] = useState("");
  const [budget, setBudget] = useState("");
  const [occasion, setOccasion] = useState("");
  const [notes, setNotes] = useState("");

  const { account, profile, save: saveProfile } = useProfile();
  const filled = useRef(false);
  useEffect(() => {
    if (filled.current || !profile) return;
    filled.current = true;
    setName((current) => current || profile.name || "");
    setPhone((current) => current || profile.phone || "");
    setEmail((current) => current || profile.email || account?.email || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  useEffect(() => {
    if (!branchKey && branches.length > 0) setBranchKey(branches[0].location_key);
  }, [branches, branchKey]);

  const incomplete = !branchKey || !name.trim() || !phone.trim() || !date.trim() || !guests.trim();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (incomplete) {
      toast.info("Please fill required fields: Branch, Name, Phone, Date, Guests.");
      return;
    }

    const subject = encodeURIComponent(`Banquet enquiry - ${branchKey}`);
    const lines = [
      `Branch (location_key): ${branchKey}`,
      `Name: ${name}`,
      `Phone: ${phone}`,
      `Email: ${email || "-"}`,
      `Occasion: ${occasion || "-"}`,
      `Date: ${date}`,
      `Preferred Time: ${timeSlot || "-"}`,
      `Guests: ${guests}`,
      `Budget (INR): ${budget || "-"}`,
      "",
      "Notes:",
      notes || "-",
      "",
      "- Sent from redchilly.in",
    ];
    void saveProfile({ name, phone });
    window.location.href = `mailto:${SITE.email}?subject=${subject}&body=${encodeURIComponent(lines.join("\n"))}`;
  };

  return (
    <form onSubmit={onSubmit} className="page-container grid gap-6 py-10 lg:grid-cols-2 lg:py-14">
      <fieldset className="space-y-5 rounded-md border border-border bg-card p-6">
        <legend className="sr-only">Event details</legend>
        <div>
          <p className="eyebrow">Event</p>
          <h2 className="mt-2 text-xl">Event details</h2>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bq-branch">
            Branch
            <Required />
          </Label>
          <select
            id="bq-branch"
            value={branchKey}
            onChange={(e) => setBranchKey(e.target.value)}
            disabled={isLoading || branches.length === 0}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading && <option value="">Loading branches...</option>}
            {!isLoading && branches.length === 0 && <option value="">No branches available</option>}
            {branches.map((b) => (
              <option key={b.id} value={b.location_key}>
                {b.name && b.name !== b.location_key ? `${b.name} (${b.location_key})` : b.location_key}
              </option>
            ))}
          </select>
          {isError && (
            <p role="alert" className="text-sm text-destructive">
              {error instanceof Error ? error.message : "Failed to load branches."}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bq-occasion">Occasion</Label>
          <Input
            id="bq-occasion"
            placeholder="Wedding, reception, birthday, corporate"
            value={occasion}
            onChange={(e) => setOccasion(e.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="bq-date">
              Date
              <Required />
            </Label>
            <Input id="bq-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bq-time">Preferred time</Label>
            <Input
              id="bq-time"
              placeholder="e.g. 11 am to 3 pm"
              value={timeSlot}
              onChange={(e) => setTimeSlot(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="bq-guests">
              Guests
              <Required />
            </Label>
            <Input
              id="bq-guests"
              type="number"
              min={1}
              inputMode="numeric"
              placeholder="e.g. 150"
              required
              value={guests}
              onChange={(e) => setGuests(e.target.value)}
              className="tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bq-budget">Approx. budget (INR)</Label>
            <Input
              id="bq-budget"
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="e.g. 200000"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="tabular-nums"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bq-notes">Notes</Label>
          <Textarea
            id="bq-notes"
            rows={5}
            placeholder="Theme, cuisine preferences, AV setup, decor, special requests"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col space-y-5 self-start rounded-md border border-border bg-card p-6">
        <legend className="sr-only">Your contact details</legend>
        <div>
          <p className="eyebrow">Contact</p>
          <h2 className="mt-2 text-xl">Your details</h2>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bq-name">
            Full name
            <Required />
          </Label>
          <Input id="bq-name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bq-phone">
            Phone
            <Required />
          </Label>
          <Input
            id="bq-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+91 9XXXXXXXXX"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bq-email">Email</Label>
          <Input
            id="bq-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Submitting opens your email app with the enquiry ready to send to {SITE.email}. You can also call{" "}
          <a href={`tel:${SITE.phoneTel}`} className="underline underline-offset-4">
            {SITE.phoneDisplay}
          </a>
          .
        </p>

        <Button type="submit" size="lg" disabled={incomplete || isLoading || branches.length === 0} className="w-full">
          <Send strokeWidth={1.75} aria-hidden />
          Send enquiry
        </Button>
      </fieldset>
    </form>
  );
}

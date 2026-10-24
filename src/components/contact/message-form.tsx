"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useProfile } from "@/hooks/useAccount";
import { Send } from "lucide-react";
import { SITE } from "@/components/site/site-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Opens the visitor's mail client with the message prefilled (no server round trip). */
export function MessageForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const { profile, save: saveProfile } = useProfile();
  const filled = useRef(false);

  useEffect(() => {
    if (filled.current || !profile) return;
    filled.current = true;
    setName((current) => current || profile.name || "");
    setPhone((current) => current || profile.phone || "");
  }, [profile]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const subject = encodeURIComponent(`New inquiry from ${name || "Guest"}`);
    const body = encodeURIComponent(`Name: ${name}\nPhone: ${phone}\n\nMessage:\n${message}\n`);
    void saveProfile({ name, phone });
    window.location.href = `mailto:${SITE.email}?subject=${subject}&body=${body}`;
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5 rounded-md border border-border bg-card p-6">
      <div>
        <p className="eyebrow">Message</p>
        <h2 className="mt-2 text-xl">Write to us</h2>
        <p className="mt-1 text-sm text-muted-foreground">This opens your email app with the message ready to send.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="contact-name">Your name</Label>
          <Input id="contact-name" name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contact-phone">Phone</Label>
          <Input
            id="contact-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+91 9XXXXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contact-message">Message</Label>
        <Textarea
          id="contact-message"
          name="message"
          rows={5}
          placeholder="How can we help?"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>
      <Button type="submit">
        <Send strokeWidth={1.75} aria-hidden />
        Send message
      </Button>
    </form>
  );
}

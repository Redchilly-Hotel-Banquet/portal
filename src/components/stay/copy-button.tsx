"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyButton({ value, label = "Copy code" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy is unavailable in this browser. Please note the code down.");
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={copy}>
      {copied ? (
        <Check className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      ) : (
        <Copy className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      )}
      {copied ? "Copied" : label}
    </Button>
  );
}

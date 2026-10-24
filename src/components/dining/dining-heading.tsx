import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DiningHeadingProps {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/** Compact page heading for the guest ordering flow. Renders the page h1. */
export function DiningHeading({ eyebrow, title, description, actions, className }: DiningHeadingProps) {
  return (
    <section className={cn("border-b border-border bg-surface", className)}>
      <div className="page-container flex flex-col gap-4 py-8 sm:flex-row sm:items-end sm:justify-between md:py-10">
        <div className="min-w-0 max-w-2xl">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className={cn("text-3xl tracking-tight sm:text-4xl", eyebrow && "mt-2")}>{title}</h1>
          {description && <div className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </section>
  );
}

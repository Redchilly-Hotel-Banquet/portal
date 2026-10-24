import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeroProps {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHero({ eyebrow, title, description, actions, className }: PageHeroProps) {
  return (
    <section className={cn("border-b border-border bg-surface", className)}>
      <div className="page-container flex flex-col gap-6 py-12 md:flex-row md:items-end md:justify-between md:py-16">
        <div className="max-w-2xl">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className={cn("text-3xl tracking-tight sm:text-4xl", eyebrow && "mt-3")}>{title}</h1>
          {description && <p className="mt-4 text-base leading-relaxed text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
    </section>
  );
}

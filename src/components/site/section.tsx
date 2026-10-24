import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionProps {
  eyebrow?: string;
  title?: string;
  description?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function Section({ eyebrow, title, description, className, children }: SectionProps) {
  return (
    <section className={cn("page-container py-12 md:py-16", className)}>
      {(eyebrow || title || description) && (
        <header className="mb-8 max-w-2xl">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          {title && <h2 className={cn("text-2xl tracking-tight sm:text-3xl", eyebrow && "mt-3")}>{title}</h2>}
          {description && <p className="mt-3 text-muted-foreground">{description}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

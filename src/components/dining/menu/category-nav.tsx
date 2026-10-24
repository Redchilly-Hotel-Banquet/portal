"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { MenuSection } from "./menu-sections";

interface CategoryNavProps {
  sections: MenuSection[];
}

/** Horizontal category index that scrolls to a section and follows the reader's position. */
export function CategoryNav({ sections }: CategoryNavProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const idsKey = sections.map((s) => s.id).join("|");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-170px 0px -60% 0px", threshold: 0 },
    );
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const go = (id: string) => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    setActiveId(id);
  };

  if (sections.length < 2) return null;

  return (
    <nav aria-label="Menu categories" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-5">
        {sections.map((s) => {
          const active = activeId === s.id;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => go(s.id)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "-mb-px whitespace-nowrap border-b-2 py-2 text-sm transition-colors",
                  active ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {s.name}
                <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{s.items.length}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

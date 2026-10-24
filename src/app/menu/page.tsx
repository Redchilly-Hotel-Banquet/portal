import type { Metadata } from "next";
import { SiteShell } from "@/components/site/site-shell";
import { MenuView } from "@/components/dining/menu/menu-view";

export const metadata: Metadata = {
  title: "Menu",
  description: "Browse the Red Chilly menu, with vegetarian and non-vegetarian dishes marked.",
};

export default function MenuPage() {
  return (
    <SiteShell>
      <MenuView />
    </SiteShell>
  );
}

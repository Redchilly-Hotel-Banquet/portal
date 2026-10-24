import type { Metadata } from "next";
import { MenuItemsManager } from "@/components/admin-menu/menu-items-manager";

export const metadata: Metadata = { title: "Menu items" };

export default function AdminMenuItemsPage() {
  return <MenuItemsManager />;
}

import type { Metadata } from "next";
import { CategoriesManager } from "@/components/admin-menu/categories-manager";

export const metadata: Metadata = { title: "Categories" };

export default function AdminCategoriesPage() {
  return <CategoriesManager />;
}

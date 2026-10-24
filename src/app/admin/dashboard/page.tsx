import type { Metadata } from "next";
import { Overview } from "@/components/admin-core/overview";

export const metadata: Metadata = { title: "Overview" };

export default function DashboardPage() {
  return <Overview />;
}

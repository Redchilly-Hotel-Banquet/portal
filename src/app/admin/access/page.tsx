import type { Metadata } from "next";
import { AccessManager } from "@/components/admin-access/access-manager";

export const metadata: Metadata = { title: "Access" };

export default function AdminAccessPage() {
  return <AccessManager />;
}

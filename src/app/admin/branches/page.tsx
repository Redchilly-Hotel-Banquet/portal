import type { Metadata } from "next";
import { BranchesManager } from "@/components/admin-branches/branches-manager";

export const metadata: Metadata = { title: "Branches" };

export default function AdminBranchesPage() {
  return <BranchesManager />;
}

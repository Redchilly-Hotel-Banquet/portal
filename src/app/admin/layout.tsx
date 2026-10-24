import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Staff Portal | Red Chilly", template: "%s | Staff Portal | Red Chilly" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

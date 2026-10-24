import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "@/components/admin-core/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

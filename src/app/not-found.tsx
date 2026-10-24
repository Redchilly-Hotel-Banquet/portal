import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page-container flex min-h-screen flex-col items-center justify-center text-center">
      <p className="eyebrow">Error 404</p>
      <h1 className="mt-3 text-4xl">Page not found</h1>
      <p className="mt-3 max-w-md text-muted-foreground">The page you are looking for does not exist or has moved.</p>
      <Link href="/" className="mt-8 text-sm font-medium text-primary underline-offset-4 hover:underline">Return home</Link>
    </main>
  );
}

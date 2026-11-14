/** Sends one WhatsApp message to each number (digits with country code, no "+"). Never throws: returns false on failure. */
export async function sendWhatsapp(to: string[], message: string): Promise<boolean> {
  const token = process.env.WA_SERVICE_TOKEN;
  if (!token) {
    console.warn("[whatsapp] WA_SERVICE_TOKEN is not set; message not sent");
    return false;
  }
  const host = process.env.WA_SERVICE_HOST;
  if (!host) {
    console.warn("[whatsapp] WA_SERVICE_HOST is not set; message not sent");
    return false;
  }
  const numbers = to.map((n) => n.replace(/\D/g, "")).filter(Boolean);
  if (numbers.length === 0) return false;
  const base = host.replace(/\/+$/, "");
  try {
    // Only send when the service reports itself healthy.
    const health = await fetch(`${base}/whatsapp/health`, { signal: AbortSignal.timeout(5_000) });
    const status = (await health.json().catch(() => null)) as { ok?: boolean } | null;
    if (!health.ok || status?.ok !== true) {
      console.warn(`[whatsapp] service is not healthy (${health.status}); message not sent`);
      return false;
    }
    const res = await fetch(`${base}/whatsapp/send`, {
      method: "POST",
      headers: { "x-api-key": token, "content-type": "application/json" },
      body: JSON.stringify({ to: numbers, message }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error(`[whatsapp] send failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.ok;
  } catch (error) {
    console.error("[whatsapp] send failed", error);
    return false;
  }
}

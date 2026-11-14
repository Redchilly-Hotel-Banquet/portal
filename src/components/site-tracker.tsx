"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Reports every visit to the public website (page views, time on page, scroll depth, and clicks on calls, e-mail,
 * WhatsApp and outbound links) to /api/public/track, so the admin Analytics can show all visitors, not only QR scans.
 * Staff screens (/admin) are not tracked. A visit (session) ends after 30 minutes without activity. The source of a visit
 * (UTM tags, referrer, ad click id) is captured once when it starts and sent with everything the visit does.
 * Add data-track="name" to any element to count its clicks; window.rcTrack(name, value) records an event from code.
 */
const IDLE_MS = 30 * 60 * 1000;
const URL_ = "/api/public/track";

type Attr = { ref: string; us: string; um: string; uc: string; ut: string; ucn: string; cid: string; ck: string };
type Session = { sid: string; last: number; attr: Attr };

const id = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 3) | 8).toString(16); }));
const safe = <T,>(fn: () => T, fallback: T): T => { try { return fn(); } catch { return fallback; } };

const send = (body: Record<string, unknown>, beacon = false) => {
  const json = JSON.stringify(body);
  if (beacon && navigator.sendBeacon) { if (safe(() => navigator.sendBeacon(URL_, new Blob([json], { type: "text/plain" })), false)) return; }
  void fetch(URL_, { method: "POST", body: json, headers: { "Content-Type": "text/plain" }, keepalive: true, credentials: "same-origin" }).catch(() => {});
};

const readSession = (): Session | null => safe(() => JSON.parse(sessionStorage.getItem("rc_s") || "null"), null);
const saveSession = (s: Session) => safe(() => sessionStorage.setItem("rc_s", JSON.stringify(s)), undefined);

const startAttr = (): Attr => {
  const q = new URLSearchParams(location.search);
  const get = (name: string) => (q.get(name) || "").slice(0, 80);
  const cid = ["gclid", "fbclid", "msclkid", "ttclid", "wbraid", "gbraid"].map((k) => (q.get(k) ? k : "")).find(Boolean) || "";
  return { ref: document.referrer.slice(0, 300), us: get("utm_source"), um: get("utm_medium"), uc: get("utm_campaign"), ut: get("utm_term"), ucn: get("utm_content"), cid, ck: "" };
};

export function SiteTracker() {
  const pathname = usePathname();

  // Clicks, and events fired from code. Set up once.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const session = readSession();
      if (!session || location.pathname.startsWith("/admin")) return;
      const link = (event.target as Element | null)?.closest?.("a,[data-track]") as HTMLElement | null;
      if (!link) return;
      const named = link.getAttribute("data-track");
      const href = link instanceof HTMLAnchorElement ? link.href : "";
      let name = named ? `click_${named}` : "";
      let value = named ? link.textContent?.trim().slice(0, 100) ?? "" : "";
      if (!name && href) {
        if (href.startsWith("tel:")) [name, value] = ["click_call", href.slice(4)];
        else if (href.startsWith("mailto:")) [name, value] = ["click_email", href.slice(7)];
        else if (/^https?:\/\/(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)/.test(href)) [name, value] = ["click_whatsapp", location.pathname];
        else if (/^https?:/.test(href) && new URL(href).host !== location.host) [name, value] = ["click_outbound", new URL(href).host];
      }
      if (name) send({ t: "ev", sid: session.sid, attr: session.attr, path: location.pathname, name, value });
    };
    document.addEventListener("click", onClick, true);
    (window as any).rcTrack = (name: string, value = "") => { const s = readSession(); if (s) send({ t: "ev", sid: s.sid, attr: s.attr, path: location.pathname, name: String(name), value: String(value) }); };
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // One page view per page; the time spent and scroll depth are added when the page is left or hidden.
  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;
    const now = Date.now();
    let session = readSession();
    const landing = !session || now - session.last > IDLE_MS;
    if (!session || landing) session = { sid: id(), last: now, attr: startAttr() };
    session.last = now;
    saveSession(session);
    const pv = id();
    const live = session;
    let shown = document.visibilityState === "visible" ? now : 0;
    let spent = 0;
    let scrolled = 0;
    const onScroll = () => {
      const room = document.documentElement.scrollHeight - window.innerHeight;
      scrolled = Math.max(scrolled, room <= 0 ? 100 : Math.min(100, Math.round(((window.scrollY + window.innerHeight) / document.documentElement.scrollHeight) * 100)));
    };
    const flush = () => {
      if (shown) { spent += Date.now() - shown; shown = 0; }
      if (spent > 0) send({ t: "leave", sid: live.sid, pv, dur: spent, scroll: scrolled }, true);
      spent = 0;
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); else shown = Date.now(); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    void fetch(URL_, { method: "POST", keepalive: true, credentials: "same-origin", headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ t: "pv", sid: live.sid, pv, landing, attr: live.attr, path: pathname, title: document.title, lang: navigator.language, scr: `${screen.width}x${screen.height}` }) })
      .then((response) => {
        // The server tells a visit that started from a QR / campaign link which one it was; the visit keeps it.
        const ck = response.headers.get("X-Campaign");
        if (ck && !live.attr.ck) { live.attr = { ...live.attr, ck }; saveSession(live); }
      }).catch(() => {});
    return () => {
      flush();
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, [pathname]);

  return null;
}

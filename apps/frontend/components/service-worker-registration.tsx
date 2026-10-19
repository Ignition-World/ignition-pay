"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Routes where service worker registration provides no benefit.
 * These are wallet read-heavy UI pages that don't need offline caching.
 */
const EXCLUDED_ROUTES = ["/settings", "/history"] as const;

function isExcludedRoute(pathname: string): boolean {
  return EXCLUDED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export default function ServiceWorkerRegistration() {
  const pathname = usePathname();
  const [registered, registeredSet] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (isExcludedRoute(pathname)) return;
    if (registered) return;

    let cancelled = false;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        if (cancelled) return;
        registeredSet(true);

        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }
      } catch (error) {
        console.error("Service worker registration failed:", error);
      }
    };

    void register();

    return () => {
      cancelled = true;
    };
  }, [pathname, registered]);

  return null;
}

"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { requestPersistence, getStorageUsage } from "@/lib/storage/quota";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

/**
 * Service worker registration.
 *
 * The worker is only registered in production. Registering in development
 * caches the dev bundle and makes hot reload behave unpredictably.
 */
export function useServiceWorker(): void {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // A failed registration must never break the app.
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);
}

/** True while the browser still has an install prompt available. */
export function useInstallPrompt(): { canInstall: boolean; install: () => void } {
  const [canInstall, setCanInstall] = useState(deferredPrompt !== null);

  useEffect(() => {
    const notify = () => setCanInstall(deferredPrompt !== null);
    listeners.add(notify);

    const onBeforeInstall = (event: Event) => {
      // Suppress the mini-infobar so we can offer it in our own UI.
      event.preventDefault();
      deferredPrompt = event as BeforeInstallPromptEvent;
      notify();
    };
    const onInstalled = () => {
      deferredPrompt = null;
      notify();
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      listeners.delete(notify);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return {
    canInstall,
    install: () => {
      const prompt = deferredPrompt;
      if (prompt === null) return;
      deferredPrompt = null;
      listeners.forEach((notify) => notify());
      void prompt.prompt();
    },
  };
}

/** Install button, shown only when the browser offers one. */
export function InstallButton() {
  const { canInstall, install } = useInstallPrompt();
  if (!canInstall) return null;

  return (
    <Button variant="outline" size="sm" className="w-full gap-2" onClick={install}>
      <Download className="size-4" />
      Install as an app
    </Button>
  );
}

/**
 * Ask for eviction protection, then report what we got.
 *
 * The browser may refuse, and some refuse silently — so the answer is shown
 * rather than assumed.
 */
export function usePersistenceRequest(): {
  persisted: boolean | null;
  request: () => Promise<void>;
} {
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    void getStorageUsage().then((usage) => setPersisted(usage.persisted));
  }, []);

  return {
    persisted,
    request: async () => {
      await requestPersistence();
      const usage = await getStorageUsage();
      setPersisted(usage.persisted);
    },
  };
}

import { Download, WifiOff, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "steinheim-install-dismissed";

/**
 * Registers the service worker, offers installation on Windows, and tells the
 * truth when the network is gone.
 *
 * The offer appears once. Someone who declines is not asked again — a nagging
 * install banner is the opposite of quiet confidence.
 */
export function InstallPrompt() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        // A failed registration costs offline support, never the application.
        console.warn("[pwa] service worker registration failed", error);
      });
    }

    const onPrompt = (event: Event) => {
      event.preventDefault();
      if (window.localStorage.getItem(DISMISSED_KEY) !== "true") {
        setDeferred(event as BeforeInstallPromptEvent);
      }
    };
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);

    setOffline(!navigator.onLine);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const dismiss = () => {
    window.localStorage.setItem(DISMISSED_KEY, "true");
    setDeferred(null);
  };

  return (
    <>
      {offline && (
        <div
          role="status"
          className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-warning/15 py-1.5 text-xs text-foreground backdrop-blur-sm"
        >
          <WifiOff className="size-3.5" />
          {ar
            ? "أنت غير متصل — البيانات المعروضة قد لا تكون محدّثة"
            : "You are offline — what you see may not be current"}
        </div>
      )}

      {deferred && (
        <div className="surface-overlay fixed bottom-24 end-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl p-5 md:bottom-6">
          <button
            onClick={dismiss}
            aria-label={ar ? "إغلاق" : "Dismiss"}
            className="absolute end-3 top-3 rounded-lg p-1 text-muted-foreground hover:bg-secondary"
          >
            <X className="size-3.5" />
          </button>
          <p className="font-serif text-xl leading-tight">
            {ar ? "ثبّت Steinheim" : "Install Steinheim"}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {ar
              ? "افتحه من قائمة ابدأ وشريط المهام، مع إشعارات وعمل بدون إنترنت."
              : "Open it from the Start menu and taskbar, with notifications and offline access."}
          </p>
          <Button
            className="mt-4 w-full gap-2"
            onClick={async () => {
              const event = deferred;
              setDeferred(null);
              await event.prompt();
              const { outcome } = await event.userChoice;
              if (outcome === "dismissed") window.localStorage.setItem(DISMISSED_KEY, "true");
            }}
          >
            <Download className="size-4" />
            {ar ? "تثبيت" : "Install"}
          </Button>
        </div>
      )}
    </>
  );
}

// /lib/pwa.ts — register service worker + install prompt

export async function registerPWA() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    console.log("[PWA] Service worker registered:", reg.scope);

    // Fire install prompt if available
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      // Dispatch custom event for UI to show install button
      window.dispatchEvent(new CustomEvent("pwa-install-available"));
    });

    // Handle install success
    window.addEventListener("appinstalled", () => {
      console.log("[PWA] App installed");
      window.dispatchEvent(new CustomEvent("pwa-installed"));
    });
  } catch (err) {
    console.warn("[PWA] SW registration failed:", err);
  }
}

// Helper for components to trigger install prompt
export function installPWA(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!window) return resolve(false);
    const handler = (e: any) => {
      e.preventDefault();
      if (e.prompt) {
        e.prompt();
        resolve(true);
      } else {
        resolve(false);
      }
    };
    window.addEventListener("beforeinstallprompt", handler);
    // Timeout after 1s
    setTimeout(() => {
      window.removeEventListener("beforeinstallprompt", handler);
      resolve(false);
    }, 1000);
  });
}

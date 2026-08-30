export function registerPWA(){
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  const url = "/sw.js";
  navigator.serviceWorker.register(url).then((reg) => {
    try { (reg as any).sync?.register?.("physi-flush").catch(()=>{}); } catch {}
    const onOnline = () => {
      try { navigator.serviceWorker.controller?.postMessage({ type: "FLUSH_QUEUE" }); } catch {}
      try { (reg as any).sync?.register?.("physi-flush").catch(()=>{}); } catch {}
    };
    window.addEventListener("online", onOnline);
    navigator.serviceWorker.addEventListener("message", (e: any) => {
      if (e.data?.type === "OFFLINE_QUEUED") {}
    });
  }).catch(()=>{});
}

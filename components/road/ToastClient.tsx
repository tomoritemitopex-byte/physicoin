"use client";
import { useState, useEffect } from "react";

export default function ToastClient() {
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const onToast = (e: any) => setToast(String(e.detail ?? ""));
    window.addEventListener("physi-toast", onToast as any);
    return () => window.removeEventListener("physi-toast", onToast as any);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  return (
    <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[rgba(185,246,106,0.2)] bg-[#0d1b2e]/90 px-4 py-2.5 font-mono text-xs font-semibold text-[#b9f66a] shadow-[0_8px_24px_rgba(0,0,0,0.4)] backdrop-blur">
      {toast}
    </div>
  );
}

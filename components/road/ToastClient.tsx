"use client";
import { useState, useEffect } from "react";

export default function ToastClient() {
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 rounded-full border border-[rgba(52,211,153,0.15)] bg-[#1a5f48]/80 px-4 py-2 font-mono text-xs text-[#f0fdf4] shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
      {toast}
    </div>
  );
}

"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TimetablePage(){
  const router=useRouter();
  useEffect(()=>{ router.replace("/app/roadmap?view=list&filter=all"); },[router]);
  return (
    <div className="mx-auto max-w-[720px] px-4 py-10 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-slate-500">Feed moved</p>
      <h1 className="mt-2 text-xl font-bold text-white">This feed now lives on the Road</h1>
      <p className="mt-1 text-sm text-slate-400">Timetable → Road List. Same data, cleaner view.</p>
      <a href="/app/roadmap?view=list&filter=all" className="mt-6 inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#022c1e]">Open Road List →</a>
    </div>
  );
}

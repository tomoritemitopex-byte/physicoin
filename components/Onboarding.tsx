"use client";
import { useEffect, useState } from "react";
import { MapPin, Users, Check } from "lucide-react";

const STEPS = [
  {
    icon: MapPin,
    title: "Find the right hall",
    desc: "See where your class really is — posted by coursemates who heard it first. Move updates show up instantly.",
    accent: "bg-emerald-500",
  },
  {
    icon: Users,
    title: "Ask if class is holding",
    desc: "Not sure the lecturer showed? One tap: “Lecturer didn't show” — if 3 coursemates agree, everyone gets a heads-up.",
    accent: "bg-amber-500",
  },
  {
    icon: Check,
    title: "Trust the green tick",
    desc: "Green means your coursemates confirmed it. No tick? Double-check. Post what you hear — one tap, no forms.",
    accent: "bg-violet-500",
  },
];

export default function Onboarding() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      const v = localStorage.getItem("physi_onboarded");
      if (!v) setOpen(true);
    } catch {}
  }, []);

  function dismiss() {
    try { localStorage.setItem("physi_onboarded", "1"); } catch {}
    setOpen(false);
  }
  function next() {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else dismiss();
  }

  if (!open) return null;
  const cur = STEPS[step];
  const Icon = cur.icon;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-[380px] overflow-hidden rounded-[20px] border border-white/10 bg-[#0c1222] shadow-2xl">
        <div className="h-1 w-full bg-white/5">
          <div className="h-full bg-white transition-all duration-300" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
        <div className="p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <span className={`flex h-9 w-9 items-center justify-center rounded-full text-white ${cur.accent}`}>
              <Icon className="h-5 w-5" />
            </span>
            <span className="font-mono text-xs tracking-widest text-slate-400">STEP {step + 1} OF 3 · 30 SEC</span>
          </div>
          <h3 className="mt-4 text-[18px] font-bold leading-tight text-white">{cur.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">{cur.desc}</p>
          <div className="mt-5 flex items-center justify-between">
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
                <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-white" : i < step ? "w-1.5 bg-white/60" : "w-1.5 bg-white/15"}`} />
              ))}
            </div>
            <span className="font-mono text-xs text-slate-500">{step + 1}/3</span>
          </div>
          <div className="mt-6 flex gap-2">
            <button onClick={next} className="flex-1 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#022c1e] hover:bg-slate-100 transition">
              {step === STEPS.length - 1 ? "Got it →" : "Next →"}
            </button>
            <button onClick={dismiss} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300 hover:bg-white/[0.07]">
              Skip
            </button>
          </div>
          <p className="mt-3 text-center font-mono text-[11px] text-slate-500">Your clicks help coursemates — no complicated rules</p>
        </div>
      </div>
    </div>
  );
}

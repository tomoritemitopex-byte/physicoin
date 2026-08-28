"use client";
import { useAuth } from "@/components/auth-context";

import { useMemo, useState } from 'react';

const programmeOptions = [
  'Audiology',
  'Biochemistry',
  'Biotechnology & Molecular Biology',
  'Doctor of Physiotherapy',
  'Environmental Health Science',
  'Information Technology & Health Informatics',
  'Medical Laboratory Science',
  'Medicine and Surgery (MBBS)',
  'Microbiology',
  'Nursing Science',
  'Nutrition & Dietetics',
  'Pharmacology',
  'Prosthetics & Orthotics',
];

export function ProfilePilotForm() {
  const { setAuth } = useAuth();
  const [fullName, setFullName] = useState('');
  const [nickname, setNickname] = useState('');
  const [programme, setProgramme] = useState(programmeOptions[0]);
  const [level, setLevel] = useState('100L');
  const [statuses, setStatuses] = useState('Student');
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const selectedStatuses = useMemo(
    () =>
      statuses
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    [statuses],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState('loading');
    setMessage('');

    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          nickname,
          programme,
          level,
          statuses: selectedStatuses,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'Could not create profile');
      }

      setState('success');
      setMessage(`Welcome, ${data.user.full_name} (@${data.user.nickname}) — you're in. Now share or confirm a lecture.`);
      setAuth({ nickname: data.user.nickname, fullName: data.user.full_name });
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'Could not create profile');
    }
  }

  return (
    <section className="rounded-card border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Join the calendar</p>
          <h3 className="mt-1 text-[18px] font-semibold tracking-tight text-white">Create your student profile</h3>
          <p className="mt-1 text-[12.5px] leading-5 text-slate-500">30 seconds — programme, level, and a nickname. That&apos;s it. <span className="text-slate-400">TEST-PHYSI points have no cash value.</span></p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-[11px] font-medium tracking-wide text-slate-500">
          Pilot · Not official · Advisory only
        </span>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold text-slate-200">
          Full name <span className="font-normal text-slate-500">(surname + first name)</span>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none ring-0 placeholder:text-slate-500"
            placeholder="John Doe"
            required
            minLength={2}
            maxLength={100}
          />
        </label>

        <label className="grid gap-2 text-sm font-semibold text-slate-200">
          Nickname <span className="font-normal text-slate-500">(what others will see)</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none ring-0 placeholder:text-slate-500"
            placeholder="alex_02"
            required
            minLength={2}
            maxLength={30}
            pattern="^[a-zA-Z0-9_.\-]+$"
            title="2–30 chars: letters, numbers, _, ., - (e.g., alex_02; Dream/dream also valid)"
          />
        </label>

        <label className="grid gap-2 text-sm font-semibold text-slate-200">
          Programme
          <select
            value={programme}
            onChange={(e) => setProgramme(e.target.value)}
            className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none ring-0"
          >
            {programmeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-semibold text-slate-200">
          Current level
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none ring-0"
          >
            {['100L', '200L', '300L', '400L', '500L', '600L'].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="md:col-span-2 grid gap-2 text-sm font-semibold text-slate-200">
          Role <span className="font-normal text-slate-500">(optional, comma-separated — e.g. Student, Course Rep)</span>
          <input
            value={statuses}
            onChange={(e) => setStatuses(e.target.value)}
            className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none ring-0 placeholder:text-slate-500"
            placeholder="Student, Course Representative"
          />
        </label>

        <button
          type="submit"
          disabled={state === 'loading'}
          className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-950 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-70 md:col-span-2"
        >
          {state === 'loading' ? 'Creating profile…' : 'Create profile — join the calendar'}
        </button>
      </form>

      <p className="mt-3 text-center font-mono text-[11px] leading-4 text-slate-600">
        Why a profile? So classmates know who shared and confirmed each lecture. One profile per person.
      </p>
      {message ? (
        <p
          className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
            state === 'success'
              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
              : 'border-rose-400/30 bg-rose-400/10 text-rose-200'
          }`}
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}

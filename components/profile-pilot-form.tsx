"use client";

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
      setMessage(`Profile created: ${data.user.full_name} (${data.user.nickname})`);
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'Could not create profile');
    }
  }

  return (
    <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-300">Testing action</p>
          <h3 className="mt-2 text-2xl font-black">Create Profile</h3>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-sky-300">
          Uses /api/profile
        </span>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold text-slate-200">
          Legal surname + first name
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none ring-0 placeholder:text-slate-500"
            placeholder="Temitope Tomori"
            required
          />
        </label>

        <label className="grid gap-2 text-sm font-semibold text-slate-200">
          Nickname
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none ring-0 placeholder:text-slate-500"
            placeholder="Tope"
            required
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
          Statuses, comma-separated
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
          {state === 'loading' ? 'Creating profile...' : 'Create Profile'}
        </button>
      </form>

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

// Terms & Disclaimers — consolidated single source of truth
import Link from "next/link";

export const metadata = {
  title: "Terms · PhysiCoin",
  description: "Terms of use and advisory — PhysiCoin is live and growing with you. Built by students, for students.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#0d3b2a] text-slate-200">
      <div className="mx-auto max-w-[820px] px-6 py-10 lg:px-8">
        <a href="/" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-[13px] text-slate-300 hover:bg-white/[0.08] transition">
          ← Back to home
        </a>
        <h1 className="mt-6 text-[30px] font-bold tracking-[-0.03em] text-white">Terms & Advisory</h1>
        <p className="mt-2 font-mono text-[12px] text-slate-500">Last updated · 20 Sep 2026 · PhysiCoin · Built by students, for students</p>
        <p className="mt-2 text-sm text-emerald-200/80">PhysiCoin is live and growing with you. Your contributions shape the app.</p>

        <div className="mt-8 space-y-6 rounded-[20px] border border-white/[0.06] bg-[#1a5f48] p-6 backdrop-blur sm:p-8">
          <section>
            <h2 className="text-[14px] font-semibold text-white">1. Advisory only — not official</h2>
            <p className="mt-2 text-[13.5px] leading-6 text-slate-400">
              PhysiCoin is a student-powered timetable. Every entry is <b className="text-slate-200">advisory gist</b> posted by students who heard a venue or time change. A green tick means your coursemates tapped <b className="text-slate-200">Yes</b> and confirmed it — it does <b className="text-slate-200">not</b> mean the department, faculty or university has confirmed it.
              Always verify exams, tests, labs and any carry-over-risk activity with your course rep, HOD or official department notice board before you act.
            </p>
          </section>

          <section>
            <h2 className="text-[14px] font-semibold text-white">2. $PHY — campus currency, no cash value</h2>
            <p className="mt-2 text-[13.5px] leading-6 text-slate-400">
              $PHY is a campus scoring unit. It has <b className="text-slate-200">no cash value</b>, is <b className="text-slate-200">non-transferable</b> and <b className="text-slate-200">non-redeemable</b>. Balances persist in your wallet (cap 10,000 $PHY) — they do not expire. $PHY cannot be exchanged for money, airtime, data or academic credit.
            </p>
            <ul className="mt-3 list-disc pl-5 text-[13px] leading-6 text-slate-400">
              <li>Daily check-in grants ~1 $PHY, multiplied by your handle&apos;s authority weight; rewards shrink as campus grows.</li>
              <li>There is no withdrawal and no promise of future value — $PHY is earned on campus and spent on campus.</li>
              <li>PhysiCoin may change, pause or end $PHY rules at any time without notice.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[14px] font-semibold text-white">3. Green tick & votes — how trust works</h2>
            <p className="mt-2 text-[13.5px] leading-6 text-slate-400">
              Posts start as <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 font-mono text-[11px] text-amber-200">advisory</span>. Anyone with a handle can tap <b className="text-slate-200">Yes / No / Skip</b>. Enough Yes-weighted points and the post turns <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-bold text-white">✓ green tick</span>. Enough No and it fades. The crowd corrects the gist — but no vote is an official confirmation.
            </p>
          </section>

          <section>
            <h2 className="text-[14px] font-semibold text-white">4. Your responsibilities</h2>
            <ul className="mt-2 list-disc pl-5 text-[13.5px] leading-6 text-slate-400">
              <li>Post only what you honestly heard — gist, not prank. No spam, no impersonation, no harassment.</li>
              <li>Use a real coursemate handle (e.g. alex_02) — not &quot;Dream&quot; or someone else&apos;s name.</li>
              <li>Do not post personal data, exam questions, or content that violates university rules.</li>
              <li>We may remove or hide posts that are reported, abusive or clearly false.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[14px] font-semibold text-white">5. No warranty / liability</h2>
            <p className="mt-2 text-[13.5px] leading-6 text-slate-400">
              PhysiCoin is provided &quot;as is&quot;, without warranties of any kind. We do not guarantee accuracy, availability or fitness for any purpose. To the fullest extent permitted by law, PhysiCoin, its builders and campus partners are not liable for any loss, missed class, missed exam or other consequence arising from reliance on advisory posts. Your department&apos;s timetable is the source of truth.
            </p>
          </section>

          <section>
            <h2 className="text-[14px] font-semibold text-white">6. Privacy — minimal, on-device</h2>
            <p className="mt-2 text-[13.5px] leading-6 text-slate-400">
              Your profile (handle, programme, level) is stored to count your vote weight. It is saved on your browser and our server. Passwords are optional — only set one if you want cross-browser sign-in. No email scraping. You can delete your profile from the Profile page at any time.
            </p>
          </section>

          <section>
            <h2 className="text-[14px] font-semibold text-white">7. Scope & changes</h2>
            <p className="mt-2 text-[13.5px] leading-6 text-slate-400">
              Features, thresholds and $PHY rules may evolve as the community grows. Continued use after changes means you accept the updated terms. Your contributions shape the app.
            </p>
          </section>

          <section>
            <h2 className="text-[14px] font-semibold text-white">8. Contact</h2>
            <p className="mt-2 text-[13.5px] leading-6 text-slate-400">
              Questions? Talk to reps on campus or open an issue in the repo.
            </p>
          </section>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <p className="font-mono text-[11px] leading-4 text-slate-400">
              By using PhysiCoin you agree to these terms. If you don&apos;t agree, please don&apos;t post or vote. Advisory only — confirm exams with your department. $PHY has no cash value.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <a href="/app/timetable" className="rounded-full bg-white px-5 py-2.5 text-[13px] font-semibold text-[#022c1e]">Open timetable →</a>
          <a href="/app/roadmap" className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-[13px] font-medium text-slate-200">View roadmap</a>
        </div>
        <p className="mt-6 font-mono text-[11px] text-slate-600">PhysiCoin · Built by students, for students · Your contributions shape the app.</p>
      </div>
    </div>
  );
}

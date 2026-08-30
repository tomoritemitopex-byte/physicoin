"use client";
export default function SearchBar({ searchQuery, setSearchQuery, searchMatchCount, onJump }: { searchQuery: string; setSearchQuery: (v: string) => void; searchMatchCount: number; onJump: () => void }) {
  const searchQ = searchQuery.trim().toLowerCase();
  const hasQuery = searchQ.length > 0;
  return (
    <div className="flex w-full items-center gap-2 rounded-full border border-white/10 bg-black/75 px-2.5 py-1.5 backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
      <span className="ml-1 text-[13px] opacity-70">🔍</span>
      <input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onJump(); }}
        placeholder="search title · venue · date (e.g. LT2, 2026-01)"
        className="flex-1 bg-transparent text-[13px] text-white placeholder:text-slate-500 outline-none"
        aria-label="Search road"
      />
      {searchQuery && (
        <span className="hidden sm:inline font-mono text-[10px] text-slate-400">{searchMatchCount} match{searchMatchCount===1?"":"es"}</span>
      )}
      <button
        onClick={onJump}
        disabled={!hasQuery}
        className={`shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-black transition ${!hasQuery ? "bg-white/10 text-slate-500 cursor-not-allowed" : "bg-white text-black hover:bg-slate-100 animate-pulse shadow"}`}
      >
        Jump ↓
      </button>
      {searchQuery && (
        <button onClick={() => setSearchQuery("")} className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-[11px] font-bold text-slate-300 hover:bg-white/15">✕</button>
      )}
    </div>
  );
}

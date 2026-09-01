"use client";
import { useEffect, useState, useCallback } from "react";
import { BUILDINGS } from "@/lib/campus";

type NoteRow = {
  id: string; title: string; building_id: string; level: string; lat?: number | null; lng?: number | null;
  ocr_text: string; preview_blur?: string; blurred: boolean; has_image?: boolean; created_at: string; cost?: number;
};

export default function NotesDrop({ userId }: { userId?: string | null }) {
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [building, setBuilding] = useState("phys");
  const [level, setLevel] = useState("200L");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [filterBuilding, setFilterBuilding] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const uid = (() => {
    if (userId) return userId;
    try { const raw = localStorage.getItem("physi_profile"); if (raw) return JSON.parse(raw)?.id ?? null; } catch {}
    return null;
  })();

  const fetchNotes = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (filterBuilding) qs.set("building_id", filterBuilding);
      if (uid) qs.set("viewer_id", uid);
      const r = await fetch(`/api/notes?${qs.toString()}`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (j?.ok) setNotes(j.notes || []);
    } catch {} finally { setLoading(false); }
  }, [filterBuilding, uid]);

  useEffect(() => { fetchNotes(); const iv = setInterval(fetchNotes, 15000); return () => clearInterval(iv); }, [fetchNotes]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setFile(f);
    if (f) {
      const url = URL.createObjectURL(f);
      setPreviewUrl(url);
    } else setPreviewUrl(null);
  }

  async function doUpload() {
    if (!file) { setMsg("Pick a photo first"); return; }
    if (!uid) { setMsg("Create profile to drop notes"); return; }
    setUploading(true); setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", title || file.name.slice(0, 40) || "Notes");
      fd.append("building_id", building);
      fd.append("level", level);
      fd.append("uploader_id", uid);
      const r = await fetch("/api/notes", { method: "POST", body: fd });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.message || "Upload failed");
      setMsg("Dropped! It’s on the campus map now");
      setFile(null); setPreviewUrl(null); setTitle("");
      fetchNotes();
    } catch (e) { setMsg((e as Error).message); } finally { setUploading(false); }
  }

  async function doUnlock(noteId: string) {
    if (!uid) { setMsg("Create profile to unlock"); return; }
    setMsg(null);
    try {
      const r = await fetch("/api/notes/unlock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ note_id: noteId, user_id: uid }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        if (j?.code === "INSUFFICIENT_COINS") { setMsg("You need 1 coin — check in to a class to earn coins"); return; }
        throw new Error(j?.message || "Unlock failed");
      }
      setMsg(j.cost === 0 ? j.message : "Unlocked — 1 coin used");
      try {
        const rr = await fetch(`/api/notes?note_id=${encodeURIComponent(noteId)}&viewer_id=${encodeURIComponent(uid)}`, { cache: "no-store" });
        const jj = await rr.json().catch(() => null);
        if (jj?.ok && jj.note) setNotes(prev => prev.map(n => n.id === noteId ? { ...n, ocr_text: jj.note.ocr_text, blurred: false, has_image: !!jj.note.image_data } : n));
        else fetchNotes();
      } catch { fetchNotes(); }
    } catch (e) { setMsg((e as Error).message); }
  }

  return (
    <div className="rounded-[20px] border border-white/10 p-3" style={{ background: "rgba(255,255,255,0.06)", backdropFilter: "blur(16px) saturate(1.14)", WebkitBackdropFilter: "blur(16px) saturate(1.14)" }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-sky-300">notes drop · campus map</p>
          <h3 className="text-[16px] font-black text-white">Snap & share notes</h3>
          <p className="font-mono text-[11px] text-white/60">Blurred preview — 1 coin to reveal. Your uploads are free.</p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 font-mono text-[10px] font-black text-black">{notes.length} drops</span>
      </div>

      <div className="mt-3 rounded-[14px] border border-white/10 bg-black/20 p-2">
        <p className="font-mono text-[11px] font-bold text-white">Drop a note</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <select value={building} onChange={e => setBuilding(e.target.value)} className="rounded-xl border border-white/10 bg-black/30 px-2 py-2 font-mono text-[12px] text-white">
            {BUILDINGS.map(b => <option key={b.id} value={b.id}>{b.icon} {b.code}</option>)}
          </select>
          <select value={level} onChange={e => setLevel(e.target.value)} className="rounded-xl border border-white/10 bg-black/30 px-2 py-2 font-mono text-[12px] text-white">
            {["100L","200L","300L","400L","500L","600L"].map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (e.g. ANA 201 — Test 2) — optional" className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-[12px] text-white placeholder:text-white/40" />
        <div className="mt-2 flex items-center gap-2">
          <input type="file" accept="image/*" onChange={onFileChange} className="block w-full max-w-[220px] rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 font-mono text-[11px] text-white file:mr-2 file:rounded-full file:border-0 file:bg-white file:px-3 file:py-1 file:text-[11px] file:font-bold file:text-black" />
          <button onClick={doUpload} disabled={uploading || !file} className="shrink-0 rounded-full bg-white px-4 py-2 text-[13px] font-black text-black disabled:opacity-50 hover:bg-sky-50">{uploading ? "Saving…" : "Drop on map →"}</button>
        </div>
        {previewUrl && <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-black/30"><img src={previewUrl} alt="preview" className="max-h-[180px] w-full object-contain" /><p className="px-2 py-1 font-mono text-[10px] text-white/50">preview</p></div>}
      </div>

      <div className="mt-3 flex gap-2">
        <select value={filterBuilding} onChange={e => setFilterBuilding(e.target.value)} className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 font-mono text-[11px] text-white">
          <option value="">All buildings</option>
          {BUILDINGS.map(b => <option key={b.id} value={b.id}>{b.icon} {b.code}</option>)}
        </select>
        <button onClick={fetchNotes} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-[11px] font-bold text-white hover:bg-white hover:text-black">↻ Refresh</button>
      </div>

      <div className="mt-3 space-y-2">
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map(i => <div key={i} className="h-[84px] animate-pulse rounded-[14px] bg-white/[0.04] border border-white/10" />)}
          </div>
        ) : notes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.03] px-3 py-6 text-center font-mono text-[11px] text-white/50">No notes yet — be first to drop one for your level</p>
        ) : (
          notes.slice(0, 12).map(n => {
            const b = BUILDINGS.find(x => x.id === n.building_id);
            return (
              <div key={n.id} className="overflow-hidden rounded-[14px] border border-white/10 bg-black/20">
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full text-[13px] text-white" style={{ background: b?.color || "#0d3b2a" }}>{b?.icon || "📝"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-black text-white">{n.title}</p>
                    <p className="font-mono text-[11px] text-white/60">{b?.code || n.building_id} · {n.level} · {new Date(n.created_at).toLocaleDateString([], { day: "2-digit", month: "short" })}</p>
                  </div>
                  {n.blurred ? (
                    <button onClick={() => doUnlock(n.id)} className="shrink-0 rounded-full bg-white px-3 py-1.5 font-mono text-[11px] font-black text-black hover:bg-amber-50">Show · 1 coin</button>
                  ) : (
                    <span className="shrink-0 rounded-full bg-emerald-500 px-3 py-1 font-mono text-[11px] font-black text-white">Revealed</span>
                  )}
                </div>
                <div className="border-t border-white/10 px-3 py-2">
                  <p className={`font-mono text-[12px] leading-5 ${n.blurred ? "text-white/50 blur-[5px] select-none" : "text-white/80"}`} style={n.blurred ? { filter: "blur(6px)" } : undefined}>
                    {n.ocr_text?.slice(0, 420) || "No text yet"}
                  </p>
                  {n.blurred && <p className="mt-1 font-mono text-[10px] text-amber-200">Tap “Show · 1 coin” to reveal — your coins are earned by checking in.</p>}
                </div>
              </div>
            );
          })
        )}
      </div>
      {msg && <p className="mt-2 rounded-xl bg-white px-3 py-2 font-mono text-[11px] font-bold text-black">{msg}</p>}
    </div>
  );
}

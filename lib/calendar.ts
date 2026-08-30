/**
 * lib/calendar.ts — Calendar sync ICS generation for verified nodes
 * WAT (Africa/Lagos UTC+1) time, venue, link
 */

export type CalendarEvent = {
  id: string;
  title: string;
  venue: string;
  event_date: string; // YYYY-MM-DD
  event_time: string; // HH:MM
  scope_type?: string;
  scope_value?: string | null;
  status?: string;
};

function pad(n: number, w=2){ return String(n).padStart(w,"0"); }

function toUTCStampFromWAT(dateStr: string, timeStr: string): string {
  const t = String(timeStr||"00:00").slice(0,5);
  const d = String(dateStr).slice(0,10);
  const iso = `${d}T${t}:00+01:00`; // WAT
  const ms = Date.parse(iso);
  const dt = isNaN(ms) ? new Date(`${d}T${t}:00`) : new Date(ms);
  // ICS DT in UTC Zulu
  const y = dt.getUTCFullYear();
  const mo = pad(dt.getUTCMonth()+1);
  const dd = pad(dt.getUTCDate());
  const hh = pad(dt.getUTCHours());
  const mm = pad(dt.getUTCMinutes());
  const ss = pad(dt.getUTCSeconds());
  return `${y}${mo}${dd}T${hh}${mm}${ss}Z`;
}

function toWATDisplay(dateStr: string, timeStr: string): string {
  try{
    const iso = `${String(dateStr).slice(0,10)}T${String(timeStr).slice(0,5)}:00+01:00`;
    const dt = new Date(iso);
    const fmt = new Intl.DateTimeFormat("en-GB", { timeZone:"Africa/Lagos", dateStyle:"medium", timeStyle:"short" }).format(dt);
    return `${fmt} WAT`;
  } catch { return `${dateStr} ${timeStr} WAT`; }
}

function escapeICS(s: string): string {
  return String(s||"").replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\n/g,"\\n");
}

export function generateICS(ev: CalendarEvent, opts?: { durationMin?: number; linkBase?: string }): string {
  const dur = opts?.durationMin ?? 60;
  const linkBase = opts?.linkBase ?? (typeof window !== "undefined" ? window.location.origin : "https://physicoin.app");
  const link = `${linkBase}/app/roadmap?event=${encodeURIComponent(ev.id)}`;
  const dtStart = toUTCStampFromWAT(ev.event_date, ev.event_time);
  // dtEnd = start + duration
  const startMs = Date.parse(`${String(ev.event_date).slice(0,10)}T${String(ev.event_time).slice(0,5)}:00+01:00`);
  const endMs = (isNaN(startMs) ? Date.now() : startMs) + dur*60*1000;
  const endDt = new Date(endMs);
  const dtEnd = `${endDt.getUTCFullYear()}${pad(endDt.getUTCMonth()+1)}${pad(endDt.getUTCDate())}T${pad(endDt.getUTCHours())}${pad(endDt.getUTCMinutes())}${pad(endDt.getUTCSeconds())}Z`;
  const nowStamp = new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d+Z/, "Z");
  const watDisplay = toWATDisplay(ev.event_date, ev.event_time);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Physicoin//Roadmap//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeICS(ev.id)}@physicoin.app`,
    `DTSTAMP:${nowStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeICS(ev.title)}`,
    `DESCRIPTION:${escapeICS(`${ev.title} — ${ev.venue} · ${watDisplay} · ${link} — Verified on Physicoin roadmap. Join: ${link}`)}`,
    `LOCATION:${escapeICS(ev.venue || "TBA")}`,
    `URL:${escapeICS(link)}`,
    `STATUS:CONFIRMED`,
    `X-WAT-TIME:${escapeICS(watDisplay)}`,
    `X-VENUE:${escapeICS(ev.venue)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

export function downloadICS(ev: CalendarEvent, filename?: string){
  const ics = generateICS(ev);
  const blob = new Blob([ics], { type:"text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `physicoin-${String(ev.id).slice(0,8)}.ics`;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{ try{ document.body.removeChild(a); URL.revokeObjectURL(url);}catch{} }, 600);
}

export function icsDataUri(ev: CalendarEvent): string {
  const ics = generateICS(ev);
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

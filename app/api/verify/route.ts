import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

async function ensureTables() {
  if (!sql) return;
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto;`;
  // physi_users may already exist; ensure columns we need exist (migration-safe)
  await sql`
    CREATE TABLE IF NOT EXISTS physi_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name TEXT NOT NULL,
      nickname TEXT NOT NULL,
      programme TEXT NOT NULL,
      level TEXT NOT NULL,
      statuses JSONB NOT NULL DEFAULT '[]'::jsonb,
      authority_base NUMERIC(3,2) NOT NULL DEFAULT 1.00,
      authority_final NUMERIC(3,2) NOT NULL DEFAULT 1.00,
      mining_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS physi_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      venue TEXT NOT NULL,
      event_date DATE NOT NULL,
      event_time TIME NOT NULL,
      scope_type TEXT NOT NULL,
      scope_value TEXT,
      status TEXT NOT NULL DEFAULT 'personal',
      authority_points NUMERIC(10,2) NOT NULL DEFAULT 0,
      required_points NUMERIC(10,2) NOT NULL DEFAULT 0,
      created_by UUID REFERENCES physi_users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS physi_verifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      verifier_id UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
      event_id UUID NOT NULL REFERENCES physi_events(id) ON DELETE CASCADE,
      vote TEXT NOT NULL CHECK (vote IN ('YES', 'NO', 'CANCEL')),
      authority_weight NUMERIC(3,2) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
}

async function resolveUser(nickname?: string, verifierId?: string) {
  if (!sql) return null;
  if (verifierId) {
    const [u] = await sql`SELECT id, nickname, authority_final FROM physi_users WHERE id = ${verifierId} LIMIT 1;`;
    if (u) return u;
  }
  if (nickname) {
    const [u] = await sql`SELECT id, nickname, authority_final FROM physi_users WHERE nickname = ${nickname} LIMIT 1;`;
    if (u) return u;
  }
  return null;
}

// POST /api/verify { nickname | verifier_id, event_id, vote: YES|NO|CANCEL }
export async function POST(request: Request) {
  try {
    if (!sql) {
      return NextResponse.json({ ok: false, error: "DATABASE_URL is not configured yet." }, { status: 503 });
    }

    await ensureTables();

    const body = await request.json().catch(() => ({}));
    const nickname = String(body.nickname ?? "").trim() || undefined;
    const verifierIdRaw = String(body.verifier_id ?? body.verifierId ?? body.user_id ?? "").trim() || undefined;
    const eventId = String(body.event_id ?? body.eventId ?? "").trim();
    const voteRaw = String(body.vote ?? "").trim().toUpperCase();

    if (!eventId || !voteRaw) {
      return NextResponse.json({ ok: false, error: "event_id and vote are required." }, { status: 400 });
    }
    if (!["YES", "NO", "CANCEL"].includes(voteRaw)) {
      return NextResponse.json({ ok: false, error: "vote must be YES, NO, or CANCEL." }, { status: 400 });
    }
    const vote = voteRaw as "YES" | "NO" | "CANCEL";

    if (!nickname && !verifierIdRaw) {
      return NextResponse.json({ ok: false, error: "nickname or verifier_id is required." }, { status: 400 });
    }

    const user = await resolveUser(nickname, verifierIdRaw);
    if (!user) {
      // No real user: store mock is not possible (FK). Return mock success so UI still works in demo.
      return NextResponse.json(
        {
          ok: true,
          mock: true,
          message: "No matching physi_users row; demo vote not persisted. Create a profile first.",
          vote,
          event_id: eventId,
        },
        { status: 200 }
      );
    }

    const verifierId = String(user.id);
    const authorityWeight = Number(user.authority_final ?? 1);

    // Verify event exists (but allow mock event ids like evt_1 to still demonstrate)
    let eventExists = false;
    try {
      const [ev] = await sql`SELECT id FROM physi_events WHERE id = ${eventId} LIMIT 1;`;
      eventExists = !!ev;
    } catch {
      eventExists = false;
    }

    if (!eventExists) {
      // If event_id is non-UUID mock like evt_1, treat as demo too
      return NextResponse.json(
        {
          ok: true,
          mock: true,
          message: "Event not found in physi_events (mock id). Demo vote not persisted. Insert events to persist.",
          vote,
          event_id: eventId,
          authority_weight: authorityWeight,
        },
        { status: 200 }
      );
    }

    // Insert verification with authority_weight
    const [row] = await sql`
      INSERT INTO physi_verifications (verifier_id, event_id, vote, authority_weight)
      VALUES (${verifierId}, ${eventId}, ${vote}, ${authorityWeight})
      RETURNING id, verifier_id, event_id, vote, authority_weight, created_at;
    `;

    // Slightly update authority_final: YES +0.02, NO -0.01, CANCEL 0, clamp 0.50..2.00
    let delta = 0;
    if (vote === "YES") delta = 0.02;
    else if (vote === "NO") delta = -0.01;

    let nextAuthority = authorityWeight;
    if (delta !== 0) {
      nextAuthority = Math.round((authorityWeight + delta) * 100) / 100;
      nextAuthority = Math.min(2.0, Math.max(0.5, nextAuthority));
      await sql`
        UPDATE physi_users
        SET authority_final = ${nextAuthority}, updated_at = NOW()
        WHERE id = ${verifierId};
      `;
    }

    return NextResponse.json(
      {
        ok: true,
        mock: false,
        verification: row,
        authority_weight: authorityWeight,
        authority_final_before: authorityWeight,
        authority_final_after: nextAuthority,
        delta,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Verify failed:", error);
    return NextResponse.json({ ok: false, error: "Could not record verification right now." }, { status: 500 });
  }
}

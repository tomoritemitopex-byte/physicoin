import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * ZK-Proof Authority API — REMOVED (inverted-audit P1 K-P3)
 *
 * The original /api/zk endpoint returned a simulated threshold check without
 * ever enforcing it on global/faculty scope writes. That false-confidence
 * pattern is worse than no control, so the route is disabled.
 *
 * A real ZK attestation flow would require actual ZK infrastructure
 * (circuit, prover, verifier). This stub exists only so any lingering
 * client hook gets a clear 410 instead of a silent 200.
 */

export async function GET(req: NextRequest) {
  return NextResponse.json({ ok: false, code: "ZK_NOT_IMPLEMENTED", message: "ZK attestation is not enforced. See docs/INVERTED_AUDIT.md P1 K-P3." }, { status: 410 });
}

export async function POST(req: NextRequest) {
  return NextResponse.json({ ok: false, code: "ZK_NOT_IMPLEMENTED", message: "ZK attestation is not enforced. See docs/INVERTED_AUDIT.md P1 K-P3." }, { status: 410 });
}

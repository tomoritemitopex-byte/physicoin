import { NextResponse } from "next/server";
import { getHallHeat } from "@/lib/campus";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const heat = await getHallHeat();
    return NextResponse.json({ ok: true, ...heat, ...heat.heat });
  } catch (e) {
    return NextResponse.json({ ok: false, code: "INTERNAL", message: String((e as Error)?.message || e) }, { status: 500 });
  }
}

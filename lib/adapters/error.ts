/**
 * lib/adapters/error.ts — ErrorAdapter (modular error logging)
 *
 * Every API route + page funnels errors through this adapter:
 * - logError(code, error, context)  → server-side log (console.error + optional Sentry)
 * - getErrorMessage(code)            → user-friendly message, never exposes stack/raw
 *
 * GitHub-visible logging:
 * - If GITHUB_TOKEN + GITHUB_REPO (owner/repo) env present, posts Issue via GitHub API
 *   so errors surface in GitHub Issues tab for fixing. Also appends to .github/error-log.md
 *   as fallback when API unavailable or in dev. No throw — fire-and-forget.
 *
 * Modular: plug-in via registry like every other adapter (theme / api / feature / db).
 * New feature: just import { logError, getErrorMessage } and use — zero core edits.
 * Build must hide raw errors from UI: always return { ok:false, code, message }.
 */

import { createRegistry } from "./registry";

// ---------------------------------------------------------------------------
// User-friendly message map — never leaks stack / raw error.
// Add codes here as features grow; fallback is generic.
// ---------------------------------------------------------------------------
const ERROR_MESSAGES: Record<string, string> = {
  // generic
  UNKNOWN: "Something went wrong. Please try again.",
  INTERNAL: "Something went wrong. Please try again.",
  NO_ADAPTER: "Service temporarily unavailable. Please try again.",
  DB_NOT_CONFIGURED: "Service is configuring. Please try again shortly.",
  DB_UNREACHABLE: "Database is temporarily unavailable. Please try again.",
  TABLE_NOT_READY: "Service is updating. Please try again shortly.",
  BAD_INPUT: "Please check your input and try again.",
  BAD_VOTE: "Invalid vote. Please try again.",
  NOT_FOUND: "Not found.",
  USER_NOT_FOUND: "User not found. Please check your handle.",
  VOTER_NOT_FOUND: "Invalid voter. Please check your account.",
  NICKNAME_TAKEN: "That handle is taken. Try another one.",
  VERIFY_FAILED: "Could not record your vote. Please try again.",
  STATS_ERROR: "Could not load stats. Please try again.",
  // verify — one-glance copy (billion-interface: no jargon, thumb-readable)
  UNAUTHORIZED: "Sign in to vote — create a handle first.",
  SELF_VOUCH: "Can't vote on your own post.",
  INSUFFICIENT_COINS: "Need 1 PHY to vote — check in first.",
  INSUFFICIENT_STAKE: "Need 1 PHY to vote — check in first.",
  RATE_LIMITED: "Too many votes — wait a moment.",
  TOO_MANY_REQUESTS: "Too many votes — wait a moment.",
  // feature-scoped
  TIMETABLE_FETCH_FAILED: "Could not load timetable. Please try again.",
  TIMETABLE_CREATE_FAILED: "Could not create event. Please try again.",
  PROFILE_FETCH_FAILED: "Could not load profile. Please try again.",
  PROFILE_CREATE_FAILED: "Could not create profile. Please try again.",
  PROFILE_DELETE_FAILED: "Could not delete account. Please try again.",
  VERIFY_FETCH_FAILED: "Could not load verifications. Please try again.",
  VERIFY_SUBMIT_FAILED: "Could not submit vote. Please try again.",
  MINING_FETCH_FAILED: "Could not load check-ins. Please try again.",
  MINING_CHECKIN_FAILED: "Check-in failed. Please try again.",
  HEALTH_CHECK_FAILED: "Health check failed. Please try again.",
  EVENTS_FETCH_FAILED: "Could not load events. Please try again.",
  // streak rescue (server-authoritative ledger)
  SELF_RESCUE: "Can't rescue your own streak — ask a course mate.",
  RESCUE_TOO_SOON: "Already rescued them recently — one rescue per pair every 14 days.",
  RESCUE_NO_GAP: "Their streak is still active — rescue is for missed days.",
  // BEDROCK rosters
  ROSTER_ONLY: "This vote is roster-only — join with the class invite code first.",
  ROSTER_NOT_FOUND: "No class found for that invite code. Check the code and try again.",
};

export function getErrorMessage(code: string): string {
  if (!code) return ERROR_MESSAGES.UNKNOWN;
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.UNKNOWN;
}

// ---------------------------------------------------------------------------
// GitHub-visible logging helpers (fire-and-forget, never throws)
// ---------------------------------------------------------------------------
function githubRepo(): string | null {
  const r = (process.env.GITHUB_REPO ?? "").trim();
  if (r && r.includes("/")) return r;
  // also support GITHUB_REPOSITORY (Actions default)
  const g = (process.env.GITHUB_REPOSITORY ?? "").trim();
  if (g && g.includes("/")) return g;
  return null;
}

function githubToken(): string | null {
  return (process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "").trim() || null;
}

// Append to .github/error-log.md for visibility in repo (even without token)
function appendToErrorLogFile(code: string, message: string, context?: Record<string, unknown>, stack?: string): void {
  // only on server (fs available), skip on edge/client
  if (typeof window !== "undefined") return;
  // Inverted-audit P1 (K-A8): Vercel filesystem is read-only/ephemeral —
  // file appends always fail there, so skip and rely on console + Issues.
  if (process.env.VERCEL) return;
  try {
    // dynamic require to avoid bundling fs into client
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = eval("require")("fs") as typeof import("fs");
    const path = eval("require")("path") as typeof import("path");
    const cwd = process.cwd();
    const dir = path.join(cwd, ".github");
    const file = path.join(dir, "error-log.md");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, `# Error Log\n\n> Auto-appended by ErrorAdapter (logError). Visible in GitHub repo.\n\n| Time | Code | Message | Context |\n|------|------|---------|---------|\n`);
    }
    const time = new Date().toISOString();
    const ctxStr = context ? JSON.stringify(context).slice(0, 800) : "";
    const safeMsg = String(message).replace(/\|/g, "\\|").slice(0, 500);
    const safeStack = stack ? String(stack).slice(0, 800).replace(/\n/g, " ") : "";
    const line = `| ${time} | ${code} | ${safeMsg} | ${ctxStr ? ctxStr + (safeStack ? " | stack: " + safeStack.slice(0, 300) : "") : safeStack} |\n`;
    fs.appendFileSync(file, line);
  } catch {
    // ignore file errors
  }
}

// Append to logs/errors.log for GitHub-visible history (git-tracked, not just Vercel)
function appendToLogsErrorsFile(code: string, message: string, context?: Record<string, unknown>, stack?: string): void {
  if (typeof window !== "undefined") return;
  // Inverted-audit P1 (K-A8): skip on Vercel (read-only fs) — see above.
  if (process.env.VERCEL) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = eval("require")("fs") as typeof import("fs");
    const path = eval("require")("path") as typeof import("path");
    const cwd = process.cwd();
    const dir = path.join(cwd, "logs");
    const file = path.join(dir, "errors.log");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(path.join(dir, ".gitkeep"))) fs.writeFileSync(path.join(dir, ".gitkeep"), "");
    const time = new Date().toISOString();
    const ctxStr = context ? JSON.stringify(context) : "";
    const safeStack = stack ? String(stack).split("\n").slice(0, 5).join(" | ").slice(0, 1000) : "";
    const line = JSON.stringify({ time, code, message: String(message).slice(0, 800), context: ctxStr.slice(0, 800), stack: safeStack }) + "\n";
    fs.appendFileSync(file, line);
  } catch {
    // ignore
  }
}

let githubThrottle = new Map<string, number>();
function shouldThrottle(key: string, windowMs = 60000): boolean {
  const now = Date.now();
  const last = githubThrottle.get(key) ?? 0;
  if (now - last < windowMs) return true;
  githubThrottle.set(key, now);
  // prune
  if (githubThrottle.size > 100) {
    githubThrottle.forEach((v, k) => {
      if (now - v > windowMs * 5) githubThrottle.delete(k);
    });
  }
  return false;
}

async function postGitHubIssue(code: string, message: string, context?: Record<string, unknown>, stack?: string): Promise<void> {
  const repo = githubRepo();
  const token = githubToken();
  if (!repo || !token) return;
  // throttle same code+message to avoid spam
  const key = `${repo}:${code}:${message.slice(0, 80)}`;
  if (shouldThrottle(key)) return;
  try {
    const title = `[ErrorAdapter:${code}] ${message.slice(0, 90)}`;
    const bodyLines = [
      `**Code:** \`${code}\``,
      `**Message:** ${message}`,
      `**Time:** ${new Date().toISOString()}`,
      context ? `**Context:**\n\`\`\`json\n${JSON.stringify(context, null, 2).slice(0, 3000)}\n\`\`\`` : "",
      stack ? `**Stack:**\n\`\`\`\n${String(stack).slice(0, 3000)}\n\`\`\`` : "",
      `---\n*Auto-created by ErrorAdapter logError — visible in Issues tab*`,
    ]
      .filter(Boolean)
      .join("\n\n");
    const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        title,
        body: bodyLines,
        labels: ["error-log", "automated"],
      }),
    });
    if (!res.ok) {
      console.error(`[ErrorAdapter] GitHub Issue create failed ${res.status} for ${repo}`);
    }
  } catch (e) {
    console.error("[ErrorAdapter] GitHub Issue post failed:", (e as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Server / client logging
// ---------------------------------------------------------------------------
export function logError(
  code: string,
  error: unknown,
  context?: Record<string, unknown>
): void {
  const err = error instanceof Error ? error : new Error(String(error ?? "unknown"));
  // Always log server-side (or browser console in client components) — never to UI
  console.error(`[ErrorAdapter:${code}]`, err.message, {
    code,
    stack: err.stack,
    ...context,
  });

  // GitHub-visible logging: files + optional Issue via API (fire-and-forget)
  try {
    appendToErrorLogFile(code, err.message, context, err.stack);
  } catch {}
  try {
    appendToLogsErrorsFile(code, err.message, context, err.stack);
  } catch {}
  // fire-and-forget Issue creation (do not await, do not block)
  try {
    // only on server where env vars exist
    if (typeof window === "undefined" && githubRepo() && githubToken()) {
      void postGitHubIssue(code, err.message, context, err.stack);
    }
  } catch {}

  // Optional Sentry hook — no dependency required. If Sentry is wired, it will capture.
  // Supports: global Sentry, window.Sentry, or @sentry/nextjs if installed.
  try {
    const g = globalThis as unknown as Record<string, unknown>;
    const sentry =
      (g["Sentry"] as { captureException?: (e: unknown, ctx?: unknown) => void } | undefined) ??
      ((typeof window !== "undefined" ? (window as unknown as Record<string, unknown>)["Sentry"] : undefined) as
        | { captureException?: (e: unknown, ctx?: unknown) => void }
        | undefined);
    if (sentry?.captureException) {
      sentry.captureException(err, { extra: { code, ...context } });
    }
    // Dynamic import placeholder — if @sentry/nextjs is installed, uncomment:
    // import("@sentry/nextjs").then(m => m.captureException(err, { extra: { code, ...context }})).catch(()=>{});
  } catch {
    // never throw from logger
  }
}

// ---------------------------------------------------------------------------
// Registry (modular adapter pattern — same as theme/api/feature/db)
// ---------------------------------------------------------------------------
export interface ErrorAdapter {
  id: string;
  label?: string;
  logError: typeof logError;
  getErrorMessage: typeof getErrorMessage;
}

const reg = createRegistry<ErrorAdapter>();
export const registerErrorAdapter = reg.registerAdapter;
export const listErrorAdapters = reg.listAdapters;
export const getErrorAdapter = reg.getAdapter;

// Default adapter — auto-registered so getErrorAdapter("error") always exists
const defaultErrorAdapter: ErrorAdapter = {
  id: "error",
  label: "Error Logging Adapter",
  logError,
  getErrorMessage,
};

registerErrorAdapter(defaultErrorAdapter);

// ---------------------------------------------------------------------------
// Zero-style hints — machine-readable fix for agent self-heal
// Each hint tells exactly what token/field to fix; RATE_LIMITED includes retryAfter.
// ---------------------------------------------------------------------------
export const ERROR_HINTS: Record<string, string> = {
  UNAUTHORIZED: "Missing or invalid session token. Fix: POST /api/auth/session with {\"user_id\":\"<id>\"} to obtain {\"token\"}, then retry with header \"Authorization: Bearer <token>\" or cookie \"physi_session=<token>\". Ensure body field \"created_by\" equals the token's user_id.",
  SELF_VOUCH: "Can't act on your own record. Fix: use a different verifier_id/event; remove your own id from the payload.",
  INSUFFICIENT_COINS: "Need 1 PHY to act. Fix: POST /api/mining to check in or wait for faucet drip, then retry.",
  INSUFFICIENT_STAKE: "Need 1 PHY to act. Fix: POST /api/mining to check in or wait for faucet drip, then retry.",
  RATE_LIMITED: "Rate limited. Fix: wait retryAfter seconds then retry.",
  TOO_MANY_REQUESTS: "Rate limited. Fix: wait retryAfter seconds then retry.",
  BAD_INPUT: "Fix the field named in hint — ensure required fields are non-empty: title, venue, event_date (YYYY-MM-DD), event_time (HH:MM), scope_type, severity (move|shift|cancelled).",
  DB_NOT_CONFIGURED: "DATABASE_URL not set. Fix: Vercel → Settings → Environment Variables → DATABASE_URL (all envs) → Redeploy. For sharding use DATABASE_URLS.",
  TABLE_NOT_READY: "A required table is missing. Fix: redeploy so build-time migrate (node scripts/migrate.mjs) creates it — runtime DDL is forbidden on hot paths.",
  BAD_SEVERITY: "Fix field 'severity': must be one of move|shift|cancelled.",
  MISSING_FIELDS: "Fix missing field(s) listed in hint — all required keys must be non-empty strings.",
};

export function getErrorHint(code: string, detail?: string): string {
  const base = ERROR_HINTS[code] ?? ERROR_HINTS.BAD_INPUT;
  if (detail) return `${detail} Hint: ${base}`;
  return base;
}

/**
 * Inverted-audit P0 (K-A3): runtime DDL is forbidden on hot paths, so a
 * missing table is a deploy-state signal, not a query bug. Detects Postgres
 * 42P01 (undefined_table) across neon/postgres.js error shapes.
 */
export function isMissingTable(error: unknown): boolean {
  const msg = String((error as any)?.message ?? error ?? "");
  const code = String((error as any)?.code ?? "");
  return (
    code === "42P01" ||
    /relation .* does not exist/i.test(msg) ||
    /table .* does not exist/i.test(msg) ||
    /no such table/i.test(msg)
  );
}

// ---------------------------------------------------------------------------
// Helper: build sanitized JSON response for API routes
// Never exposes stack / raw error.message to client
// Includes Zero-style hint + optional retryAfter for 429
// ---------------------------------------------------------------------------
export function errorResponse(code: string, status = 500, extra?: Record<string, unknown>) {
  const hint = (extra as any)?.hint ?? getErrorHint(code, (extra as any)?.detail as string | undefined);
  const retryAfter = (extra as any)?.retryAfter as number | undefined;
  const detail = (extra as any)?.detail as string | undefined;
  // strip internal detail from spread
  const { detail: _d, hint: _h, retryAfter: _r, ...rest } = (extra ?? {}) as Record<string, unknown>;
  return {
    ok: false as const,
    code,
    message: getErrorMessage(code),
    hint,
    ...(retryAfter !== undefined ? { retryAfter } : {}),
    ...(detail ? { detail } : {}),
    ...rest,
  };
}

export function logAndResponse(
  code: string,
  error: unknown,
  context?: Record<string, unknown>,
  status = 500
): Response {
  logError(code, error, context);
  const body = JSON.stringify(errorResponse(code, status));
  const headers: Record<string, string> = { "content-type": "application/json" };
  const parsed = JSON.parse(body) as { retryAfter?: number };
  if (parsed.retryAfter !== undefined) headers["Retry-After"] = String(parsed.retryAfter);
  return new Response(body, {
    status,
    headers,
  });
}

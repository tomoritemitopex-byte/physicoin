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
  BAD_INPUT: "Please check your input and try again.",
  BAD_VOTE: "Invalid vote. Please try again.",
  NOT_FOUND: "Not found.",
  USER_NOT_FOUND: "User not found. Please check your handle.",
  NICKNAME_TAKEN: "That handle is taken. Try another one.",
  VERIFY_FAILED: "Could not record your vote. Please try again.",
  STATS_ERROR: "Could not load stats. Please try again.",
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
// Helper: build sanitized JSON response for API routes
// Never exposes stack / raw error.message to client
// ---------------------------------------------------------------------------
export function errorResponse(code: string, status = 500, extra?: Record<string, unknown>) {
  return {
    ok: false as const,
    code,
    message: getErrorMessage(code),
    ...extra,
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
  return new Response(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}

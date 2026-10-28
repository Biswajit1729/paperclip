import { logger } from "../../middleware/logger.js";

const COMPANY_START_LOCK_STALE_MS = 30_000;
const startLocksByCompany = new Map<string, { promise: Promise<void>; startedAtMs: number }>();
let cachedOverridesRaw: string | null = null;
let cachedOverrides = new Map<string, number | null>();

function parseLimit(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const limit = Number(trimmed);
  if (!Number.isSafeInteger(limit)) return undefined;
  return limit === 0 ? null : limit;
}

function parseOverrides(raw: string) {
  if (cachedOverridesRaw === raw) return cachedOverrides;
  const overrides = new Map<string, number | null>();
  let invalidEntryCount = 0;
  for (const entry of raw.split(",")) {
    if (!entry.trim()) continue;
    const match = /^([^=:]+)\s*[=:]\s*(\d+)$/.exec(entry.trim());
    const companyId = match?.[1]?.trim();
    const limit = match ? parseLimit(match[2]) : undefined;
    if (!companyId || limit === undefined) {
      invalidEntryCount++;
      continue;
    }
    overrides.set(companyId, limit);
  }
  if (invalidEntryCount > 0) {
    logger.warn({ invalidEntryCount }, "ignoring invalid company heartbeat concurrency override entries");
  }
  cachedOverridesRaw = raw;
  cachedOverrides = overrides;
  return overrides;
}

export function resolveCompanyMaxConcurrentRuns(
  companyId: string,
  env: NodeJS.ProcessEnv = process.env,
): number | null {
  const defaultLimit = parseLimit(env.PAPERCLIP_COMPANY_MAX_CONCURRENT_RUNS ?? "");
  const overrides = parseOverrides(env.PAPERCLIP_COMPANY_MAX_CONCURRENT_RUNS_OVERRIDES ?? "");
  return overrides.has(companyId) ? overrides.get(companyId)! : defaultLimit ?? null;
}

async function waitForCompanyStartLock(companyId: string, lock: { promise: Promise<void>; startedAtMs: number }) {
  const elapsedMs = Date.now() - lock.startedAtMs;
  const remainingMs = COMPANY_START_LOCK_STALE_MS - elapsedMs;
  if (remainingMs <= 0) {
    logger.warn({ companyId, staleMs: elapsedMs }, "company start lock stale; continuing queued-run start");
    return;
  }

  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  await Promise.race([
    lock.promise,
    new Promise<void>((resolve) => {
      timeout = setTimeout(() => {
        timedOut = true;
        resolve();
      }, remainingMs);
    }),
  ]);
  if (timeout) clearTimeout(timeout);

  if (timedOut) {
    logger.warn({ companyId, staleMs: COMPANY_START_LOCK_STALE_MS }, "company start lock timed out; continuing queued-run start");
  }
}

export async function withCompanyStartLock<T>(companyId: string, fn: () => Promise<T>) {
  const previous = startLocksByCompany.get(companyId);
  const waitForPrevious = previous ? waitForCompanyStartLock(companyId, previous) : Promise.resolve();
  const run = waitForPrevious.then(fn);
  const marker = run.then(
    () => undefined,
    () => undefined,
  );
  startLocksByCompany.set(companyId, { promise: marker, startedAtMs: Date.now() });
  try {
    return await run;
  } finally {
    if (startLocksByCompany.get(companyId)?.promise === marker) {
      startLocksByCompany.delete(companyId);
    }
  }
}

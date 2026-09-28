// In-memory ring buffer of recent requests, so the dashboard's Logs page can show
// live traffic without needing Render dashboard access. Lost on restart/redeploy and
// doesn't span multiple instances — fine for a single free-tier instance used for
// testing, not meant as a durable log store.
export interface RequestLogEntry {
  id: number;
  timestamp: string;
  method: string;
  path: string;
  status: number;
  tookMs: number;
  body: unknown;
}

const MAX_ENTRIES = 300;
const buffer: RequestLogEntry[] = [];
let nextId = 1;

export function recordRequest(entry: Omit<RequestLogEntry, "id" | "timestamp">): void {
  buffer.push({ id: nextId++, timestamp: new Date().toISOString(), ...entry });
  if (buffer.length > MAX_ENTRIES) buffer.shift();
}

// Most recent first.
export function getRecentRequests(): RequestLogEntry[] {
  return [...buffer].reverse();
}

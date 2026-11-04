import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes with conditional logic, de-duplicating conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Relative time like "4s", "12m", "3h", "2d" from an epoch-ms timestamp.
 *  `now` is explicit so nothing reads the wall clock during render (see
 *  useClientNow). */
export function relativeTime(ms: number, now: number): string {
  const diff = Math.max(0, now - ms);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

/** Absolute timestamp with millisecond precision, e.g. 2026-11-03 14:22:07.413Z */
export function absoluteTime(ms: number): string {
  const d = new Date(ms);
  const iso = d.toISOString(); // 2026-11-03T14:22:07.413Z
  return iso.replace("T", " ");
}

/** A calendar date (YYYY-MM-DD) from an epoch (seconds or ms) or an ISO string.
 *  The billing provider's period-end shape isn't pinned, so parse defensively
 *  and never throw — an unparseable value renders as-is. */
export function formatDate(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  let ms: number;
  if (typeof value === "number") {
    ms = value < 1e12 ? value * 1000 : value;
  } else if (/^\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    ms = n < 1e12 ? n * 1000 : n;
  } else {
    ms = Date.parse(value);
  }
  if (!Number.isFinite(ms)) return String(value);
  return new Date(ms).toISOString().slice(0, 10);
}

/** Human-readable byte size: 0 B, 812 B, 1.4 KB, 2.3 MB. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

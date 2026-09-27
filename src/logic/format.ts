// Metric-only formatting: kg, km, min/km, 24-hour time.

/** Seconds per km, or null when the distance is not positive. */
export function paceSecondsPerKm(durationS: number, distanceKm: number): number | null {
  if (!(distanceKm > 0) || !(durationS > 0)) return null;
  return durationS / distanceKm;
}

/** 345 → "5:45" */
export function formatMinSec(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** 3725 → "1:02:05", 1805 → "30:05" */
export function formatDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  if (h === 0) return formatMinSec(s);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** "5:45 /km" */
export function formatPace(durationS: number, distanceKm: number): string | null {
  const pace = paceSecondsPerKm(durationS, distanceKm);
  return pace === null ? null : `${formatMinSec(pace)} /km`;
}

/** 42.5 → "42.5 kg", 40 → "40 kg" */
export function formatKg(kg: number): string {
  return `${trimNumber(kg)} kg`;
}

/** 5.2 → "5.2 km" */
export function formatKm(km: number): string {
  return `${trimNumber(km)} km`;
}

function trimNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** Parse "5,2" or "5.2" (Swedish keyboards type a comma). Returns null if invalid. */
export function parseDecimal(input: string): number | null {
  const s = input.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/** Parse "mm:ss" or "h:mm:ss" or plain minutes into seconds. */
export function parseDuration(input: string): number | null {
  const s = input.trim();
  if (/^\d+$/.test(s)) return Number(s) * 60;
  const parts = s.split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.slice(1).some((n) => n >= 60)) return null;
  return nums.reduce((acc, n) => acc * 60 + n, 0);
}

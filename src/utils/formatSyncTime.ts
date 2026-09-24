/** "just now", "5 min ago", "today at 09:05", or the date. Pure, for the sync status row. */

import { getLocalDateStr } from './streaks';

const MINUTE_MS = 60_000;

export function formatSyncTime(iso: string, now: Date = new Date()): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return 'recently';

  // A timestamp slightly in the future (clock skew) still reads as "just now".
  const minutes = Math.floor((now.getTime() - at) / MINUTE_MS);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;

  const date = new Date(at);
  if (getLocalDateStr(date) === getLocalDateStr(now)) {
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `today at ${hh}:${mm}`;
  }
  return date.toLocaleDateString();
}

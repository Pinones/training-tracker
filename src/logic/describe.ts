// Human-readable summaries of plan items, used by the Review step and plan lists.

import { strings } from '../strings';
import { formatKg, formatKm, formatMinSec } from './format';
import type { DraftItem } from './plan';
import type { Progression, Weekday } from './types';

const d = strings.describe;

/** 30 → "30 s", 60 → "1 min", 90 → "1:30 min" */
export function shortDuration(seconds: number): string {
  if (seconds < 60) return d.seconds(seconds);
  return seconds % 60 === 0 ? d.minutes(seconds / 60) : `${formatMinSec(seconds)} min`;
}

function range(min: number, max: number | undefined): string {
  return max !== undefined && max !== min ? `${min}–${max}` : String(min);
}

/** Main line, e.g. "Squat 5×5 @ 20 kg" or "Easy run 30 min". */
export function describeItem(item: DraftItem, exerciseName: string | undefined): string {
  const name = exerciseName ?? '?';
  const c = item.config;
  switch (item.type) {
    case 'weight_reps': {
      const w = c as { sets: number; reps: number; start_weight: number };
      return `${name} ${d.sets(w.sets, w.reps)} ${d.at(formatKg(w.start_weight))}`;
    }
    case 'bodyweight_reps': {
      const b = c as { sets: number; reps: number };
      return `${name} ${d.sets(b.sets, b.reps)}`;
    }
    case 'timed': {
      const t = c as { sets: number; seconds: number };
      return `${name} ${t.sets}×${d.seconds(t.seconds)}`;
    }
    case 'run_continuous': {
      const r = c as { label: string; duration_min?: number; distance_km?: number };
      const parts = [r.duration_min !== undefined && d.minutes(r.duration_min), r.distance_km !== undefined && formatKm(r.distance_km)];
      return `${r.label} ${parts.filter(Boolean).join(d.or)}`;
    }
    case 'run_intervals': {
      const r = c as {
        label: string;
        warmup_min: number;
        work_s: number;
        recovery_s: number;
        rounds_min: number;
        rounds_max: number;
        cooldown_min: number;
        cooldown_max_min?: number;
      };
      const parts = [
        r.warmup_min > 0 && d.warmup(d.minutes(r.warmup_min)),
        d.hardEasy(shortDuration(r.work_s), shortDuration(r.recovery_s), range(r.rounds_min, r.rounds_max)),
        r.cooldown_min > 0 && d.cooldown(`${range(r.cooldown_min, r.cooldown_max_min)} min`),
      ];
      return `${r.label}: ${parts.filter(Boolean).join(', ')}`;
    }
    case 'free': {
      const f = c as { title: string; duration_min?: number };
      return f.duration_min ? `${f.title}, ${d.minutes(f.duration_min)}` : f.title;
    }
  }
}

export function describeProgression(p: Progression): string {
  switch (p.kind) {
    case 'none':
      return d.fixed;
    case 'linear':
      return d.linear(formatKg(p.increment), p.failuresBeforeDeload, p.deloadPercent, formatKg(p.minWeight));
    case 'reps':
      return d.reps(p.increment, p.maxReps);
    case 'step': {
      const fmt =
        p.field === 'duration_min' ? d.minutes : p.field === 'distance_km' ? formatKm : (n: number) => `${shortDuration(n)}`;
      const amount = p.field === 'work_s' ? `${shortDuration(p.amount)} ${d.workTime}` : fmt(p.amount);
      return d.step(amount, p.everyWeeks, fmt(p.cap));
    }
  }
}

/** Extra notes: "optional · Fri only" */
export function describeFlags(item: DraftItem): string {
  const c = item.config as { optional?: boolean; days?: Weekday[] };
  const flags: string[] = [];
  if (c.optional) flags.push(d.optional);
  if (c.days?.length) flags.push(d.onlyOn(c.days.map((w) => strings.weekdaysShort[w]).join(', ')));
  return flags.join(d.or);
}

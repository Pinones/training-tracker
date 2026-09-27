import { addDays, compareDates, weekday, type ISODate } from './dates';
import type { ScheduleSlot, SessionStatus, UUID } from './types';

export interface Rotation {
  id: UUID;
  workout_ids: UUID[];
}

/** The minimal view of a session that rotation resolution needs. */
export interface RotationSession {
  workout_id: UUID;
  date: ISODate;
  status: SessionStatus;
  finished_at?: string | null;
  deleted_at?: string | null;
}

export type ResolvedSlot =
  | { kind: 'rest' }
  | { kind: 'workout'; workoutId: UUID; rotationId: UUID | null };

function chronological(a: RotationSession, b: RotationSession): number {
  return compareDates(a.date, b.date) || (a.finished_at ?? '').localeCompare(b.finished_at ?? '');
}

/**
 * The last completed (not deleted) session whose workout belongs to the rotation.
 * `before` limits the search to sessions strictly before that date, so a day's
 * slot keeps resolving to the same workout after it has been completed.
 */
export function lastCompletedInRotation(
  workoutIds: readonly UUID[],
  sessions: readonly RotationSession[],
  before?: ISODate,
): RotationSession | null {
  let last: RotationSession | null = null;
  for (const s of sessions) {
    if (s.status !== 'completed' || s.deleted_at) continue;
    if (!workoutIds.includes(s.workout_id)) continue;
    if (before && compareDates(s.date, before) >= 0) continue;
    if (!last || chronological(s, last) > 0) last = s;
  }
  return last;
}

/** The workout after `lastWorkoutId` in the rotation (the first one when there is no history). */
export function workoutAfter(workoutIds: readonly UUID[], lastWorkoutId: UUID | null): UUID | null {
  if (workoutIds.length === 0) return null;
  const i = lastWorkoutId ? workoutIds.indexOf(lastWorkoutId) : -1;
  return workoutIds[(i + 1) % workoutIds.length] ?? null;
}

/** Which workout a rotation slot means right now: the next one after the last completed. */
export function nextInRotation(
  workoutIds: readonly UUID[],
  sessions: readonly RotationSession[],
  before?: ISODate,
): UUID | null {
  const last = lastCompletedInRotation(workoutIds, sessions, before);
  return workoutAfter(workoutIds, last?.workout_id ?? null);
}

function slotFor(schedule: readonly ScheduleSlot[], date: ISODate): ScheduleSlot | undefined {
  const wd = weekday(date);
  return schedule.find((s) => s.weekday === wd);
}

/** Resolve what the plan prescribes on `date`, given the session history. */
export function resolveDay(
  schedule: readonly ScheduleSlot[],
  rotations: readonly Rotation[],
  sessions: readonly RotationSession[],
  date: ISODate,
): ResolvedSlot {
  const slot = slotFor(schedule, date);
  if (!slot || slot.slot_kind === 'rest') return { kind: 'rest' };
  if (slot.slot_kind === 'workout') {
    return slot.workout_id ? { kind: 'workout', workoutId: slot.workout_id, rotationId: null } : { kind: 'rest' };
  }
  const rotation = rotations.find((r) => r.id === slot.rotation_id);
  const workoutId = rotation ? nextInRotation(rotation.workout_ids, sessions, date) : null;
  return workoutId && rotation ? { kind: 'workout', workoutId, rotationId: rotation.id } : { kind: 'rest' };
}

/**
 * Project the plan forward `days` days starting at `from`, assuming every planned
 * rotation workout gets done in order. Used for the week strip and daily briefs.
 * Sessions on or after `from` are ignored: the projection is what is *planned*.
 */
export function projectSchedule(
  schedule: readonly ScheduleSlot[],
  rotations: readonly Rotation[],
  sessions: readonly RotationSession[],
  from: ISODate,
  days: number,
): { date: ISODate; slot: ResolvedSlot }[] {
  const pointer = new Map<UUID, UUID | null>();
  for (const r of rotations) {
    pointer.set(r.id, lastCompletedInRotation(r.workout_ids, sessions, from)?.workout_id ?? null);
  }

  const out: { date: ISODate; slot: ResolvedSlot }[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const slot = slotFor(schedule, date);
    let resolved: ResolvedSlot = { kind: 'rest' };
    if (slot?.slot_kind === 'workout' && slot.workout_id) {
      resolved = { kind: 'workout', workoutId: slot.workout_id, rotationId: null };
    } else if (slot?.slot_kind === 'rotation') {
      const rotation = rotations.find((r) => r.id === slot.rotation_id);
      if (rotation) {
        const next = workoutAfter(rotation.workout_ids, pointer.get(rotation.id) ?? null);
        if (next) {
          pointer.set(rotation.id, next);
          resolved = { kind: 'workout', workoutId: next, rotationId: rotation.id };
        }
      }
    }
    out.push({ date, slot: resolved });
  }
  return out;
}

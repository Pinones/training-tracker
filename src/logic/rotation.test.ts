import { describe, expect, it } from 'vitest';
import { nextInRotation, projectSchedule, resolveDay, type Rotation, type RotationSession } from './rotation';
import type { ScheduleSlot } from './types';

const AB = ['A', 'B'];

function done(workout_id: string, date: string, extra: Partial<RotationSession> = {}): RotationSession {
  return { workout_id, date, status: 'completed', finished_at: `${date}T18:00:00Z`, ...extra };
}

describe('nextInRotation', () => {
  it('starts with the first workout when there is no history', () => {
    expect(nextInRotation(AB, [])).toBe('A');
  });

  it('alternates after the last completed workout', () => {
    expect(nextInRotation(AB, [done('A', '2026-09-21')])).toBe('B');
    expect(nextInRotation(AB, [done('A', '2026-09-21'), done('B', '2026-09-23')])).toBe('A');
  });

  it('is independent of calendar gaps (a missed week does not skip a workout)', () => {
    expect(nextInRotation(AB, [done('A', '2026-08-01')])).toBe('B');
  });

  it('ignores skipped, in-progress and deleted sessions', () => {
    const sessions = [
      done('A', '2026-09-21'),
      { workout_id: 'B', date: '2026-09-23', status: 'skipped' as const },
      { workout_id: 'B', date: '2026-09-24', status: 'in_progress' as const },
      done('B', '2026-09-25', { deleted_at: '2026-09-26T08:00:00Z' }),
    ];
    expect(nextInRotation(AB, sessions)).toBe('B');
  });

  it('ignores workouts that are not in the rotation', () => {
    expect(nextInRotation(AB, [done('A', '2026-09-21'), done('RUN', '2026-09-22')])).toBe('B');
  });

  it('orders by date regardless of input order, then by finish time', () => {
    const sessions = [done('A', '2026-09-25'), done('B', '2026-09-23')];
    expect(nextInRotation(AB, sessions)).toBe('B');
    const sameDay = [
      done('B', '2026-09-25', { finished_at: '2026-09-25T19:00:00Z' }),
      done('A', '2026-09-25', { finished_at: '2026-09-25T07:00:00Z' }),
    ];
    expect(nextInRotation(AB, sameDay)).toBe('A');
  });

  it('follows a swapped-in workout ("do a different workout")', () => {
    // Plan said A, user did B instead: next is A.
    expect(nextInRotation(AB, [done('A', '2026-09-21'), done('A', '2026-09-23')])).toBe('B');
    expect(nextInRotation(AB, [done('B', '2026-09-21')])).toBe('A');
  });

  it('handles rotations longer than two', () => {
    expect(nextInRotation(['A', 'B', 'C'], [done('B', '2026-09-21')])).toBe('C');
    expect(nextInRotation(['A', 'B', 'C'], [done('C', '2026-09-21')])).toBe('A');
  });

  it('with `before`, a day keeps showing its workout after it is completed', () => {
    const sessions = [done('A', '2026-09-21'), done('B', '2026-09-23')];
    expect(nextInRotation(AB, sessions, '2026-09-23')).toBe('B');
  });
});

// Hybrid StrongLifts schedule: Mon/Wed/Fri rotation [A, B], Tue run, Sat intervals.
const rot: Rotation = { id: 'rot', workout_ids: AB };
const schedule: ScheduleSlot[] = [
  { weekday: 0, slot_kind: 'rotation', workout_id: null, rotation_id: 'rot' },
  { weekday: 1, slot_kind: 'workout', workout_id: 'RUN', rotation_id: null },
  { weekday: 2, slot_kind: 'rotation', workout_id: null, rotation_id: 'rot' },
  { weekday: 3, slot_kind: 'rest', workout_id: null, rotation_id: null },
  { weekday: 4, slot_kind: 'rotation', workout_id: null, rotation_id: 'rot' },
  { weekday: 5, slot_kind: 'workout', workout_id: 'INT', rotation_id: null },
  { weekday: 6, slot_kind: 'rest', workout_id: null, rotation_id: null },
];

describe('resolveDay', () => {
  it('resolves rest, fixed and rotation slots', () => {
    expect(resolveDay(schedule, [rot], [], '2026-09-24')).toEqual({ kind: 'rest' }); // Thu
    expect(resolveDay(schedule, [rot], [], '2026-09-22')).toEqual({ kind: 'workout', workoutId: 'RUN', rotationId: null });
    expect(resolveDay(schedule, [rot], [done('A', '2026-09-21')], '2026-09-23')).toEqual({
      kind: 'workout',
      workoutId: 'B',
      rotationId: 'rot',
    });
  });

  it('treats a day missing from the schedule as rest', () => {
    expect(resolveDay([], [rot], [], '2026-09-21')).toEqual({ kind: 'rest' });
  });
});

describe('projectSchedule', () => {
  it('projects alternating A/B across two weeks', () => {
    const days = projectSchedule(schedule, [rot], [done('A', '2026-09-25')], '2026-09-28', 14);
    const rotationDays = days.filter((d) => d.slot.kind === 'workout' && d.slot.rotationId).map((d) =>
      d.slot.kind === 'workout' ? d.slot.workoutId : '',
    );
    expect(rotationDays).toEqual(['B', 'A', 'B', 'A', 'B', 'A']);
    expect(days[1]!.slot).toEqual({ kind: 'workout', workoutId: 'RUN', rotationId: null });
    expect(days[3]!.slot).toEqual({ kind: 'rest' });
  });
});

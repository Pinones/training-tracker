import { describe, expect, it } from 'vitest';
import {
  deloadWeight,
  replayLinear,
  replayReps,
  roundToStep,
  stepValue,
  type ExerciseEvent,
  type SessionEvent,
} from './progression';
import { linear, type RepsProgression, type StepProgression } from './types';

const squat = linear(2.5); // defaults: 3 failures, -10 %, round 2.5, min 20
const deadlift = linear(5);

/** A 5-set session at `weight`; `reps` are reps done per set (default all 5). */
function session(date: string, weight: number, reps: (number | null)[] = [5, 5, 5, 5, 5], target = 5): SessionEvent {
  return { type: 'session', date, sets: reps.map((r) => ({ targetReps: target, repsDone: r, weight })) };
}
const FAIL = [5, 5, 5, 4, 3];

describe('rounding', () => {
  it('rounds to the nearest plate step', () => {
    expect(roundToStep(38.25, 2.5)).toBe(37.5);
    expect(roundToStep(54, 2.5)).toBe(55);
    expect(roundToStep(56.25, 2.5)).toBe(57.5); // exactly halfway rounds up
    expect(roundToStep(0.1 + 0.2, 0.1)).toBe(0.3);
  });
});

describe('linear progression', () => {
  it('starts at the start weight', () => {
    expect(replayLinear(squat, 20, []).weight).toBe(20);
  });

  it('adds the increment after every fully successful session', () => {
    const events = [session('2026-09-21', 20), session('2026-09-23', 22.5), session('2026-09-25', 25)];
    expect(replayLinear(squat, 20, events).weight).toBe(27.5);
    expect(replayLinear(deadlift, 40, [session('2026-09-23', 40)]).weight).toBe(45);
  });

  it('repeats the weight after a failed session', () => {
    const state = replayLinear(squat, 20, [session('2026-09-21', 50, FAIL)]);
    expect(state.weight).toBe(50);
    expect(state.failStreak).toBe(1);
  });

  it('counts unlogged sets as failures once the exercise was started', () => {
    const state = replayLinear(squat, 50, [session('2026-09-21', 50, [5, 5, 5, null, null])]);
    expect(state.weight).toBe(50);
    expect(state.failStreak).toBe(1);
  });

  it('ignores an exercise that was not started at all', () => {
    const state = replayLinear(squat, 50, [session('2026-09-21', 50, [null, null, null, null, null])]);
    expect(state).toMatchObject({ weight: 50, failStreak: 0, timeline: [] });
  });

  it('deloads 10 % after 3 failed sessions in a row at the same weight, rounded to 2.5 kg', () => {
    const events = [
      session('2026-09-21', 60, FAIL),
      session('2026-09-23', 60, FAIL),
      session('2026-09-25', 60, FAIL),
    ];
    const state = replayLinear(squat, 60, events);
    expect(state.weight).toBe(55); // 54 → nearest 2.5 = 55
    expect(state.failStreak).toBe(0);
    expect(state.timeline.map((t) => t.outcome)).toEqual(['fail', 'fail', 'deload']);
  });

  it('rounds a deload down when that is nearest', () => {
    expect(deloadWeight(42.5, squat)).toBe(37.5); // 38.25 → 37.5
  });

  it('resets the failure streak after a success', () => {
    const events = [
      session('2026-09-21', 60, FAIL),
      session('2026-09-23', 60, FAIL),
      session('2026-09-25', 60),
      session('2026-09-28', 62.5, FAIL),
      session('2026-09-30', 62.5, FAIL),
    ];
    const state = replayLinear(squat, 60, events);
    expect(state.weight).toBe(62.5);
    expect(state.failStreak).toBe(2);
  });

  it('restarts the streak when a failure happens at a different weight', () => {
    const events = [
      session('2026-09-21', 60, FAIL),
      session('2026-09-23', 60, FAIL),
      session('2026-09-25', 57.5, FAIL), // user chose a lighter weight
    ];
    const state = replayLinear(squat, 60, events);
    expect(state.weight).toBe(57.5);
    expect(state.failStreak).toBe(1);
  });

  it('never deloads below the minimum weight', () => {
    const events = [session('2026-09-21', 20, FAIL), session('2026-09-23', 20, FAIL), session('2026-09-25', 20, FAIL)];
    expect(replayLinear(squat, 20, events).weight).toBe(20);
    expect(deloadWeight(22.5, squat)).toBe(20); // 20.25 → 20
  });

  it('does not raise a weight already below the minimum on deload', () => {
    const light = linear(1, { minWeight: 20, roundTo: 1 });
    expect(deloadWeight(10, light)).toBe(10);
  });

  it('respects the configured failures, percentage and step', () => {
    const custom = linear(5, { failuresBeforeDeload: 2, deloadPercent: 20, roundTo: 5, minWeight: 40 });
    const state = replayLinear(custom, 100, [session('2026-09-21', 100, FAIL), session('2026-09-23', 100, FAIL)]);
    expect(state.weight).toBe(80);
  });

  it('uses the weight actually lifted, not the prescribed one', () => {
    // Prescribed 42.5 but the user loaded 45 and made it.
    expect(replayLinear(squat, 42.5, [session('2026-09-21', 45)]).weight).toBe(47.5);
  });

  it('applies a manual override as a dated event', () => {
    const events: ExerciseEvent[] = [
      session('2026-09-21', 20),
      { type: 'override', date: '2026-09-22', weight: 60 },
      session('2026-09-23', 60),
    ];
    expect(replayLinear(squat, 20, events).weight).toBe(62.5);
  });

  it('an override resets the failure streak', () => {
    const events: ExerciseEvent[] = [
      session('2026-09-21', 60, FAIL),
      session('2026-09-23', 60, FAIL),
      { type: 'override', date: '2026-09-24', weight: 60 },
      session('2026-09-25', 60, FAIL),
    ];
    const state = replayLinear(squat, 60, events);
    expect(state.weight).toBe(60);
    expect(state.failStreak).toBe(1);
  });

  it('orders same-day events by timestamp', () => {
    const events: ExerciseEvent[] = [
      { type: 'override', date: '2026-09-21', at: '2026-09-21T20:00:00Z', weight: 30 },
      { ...session('2026-09-21', 20), at: '2026-09-21T18:00:00Z' },
    ];
    // The session came first (→ 22.5), then the evening override set 30.
    expect(replayLinear(squat, 20, events).weight).toBe(30);
  });

  it('keeps floating point clean over many increments', () => {
    const events = Array.from({ length: 40 }, (_, i) =>
      session(`2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`, 20 + i * 2.5),
    );
    expect(replayLinear(squat, 20, events).weight).toBe(120);
  });
});

describe('replay after editing history', () => {
  const base = [
    session('2026-09-21', 20),
    session('2026-09-23', 22.5),
    session('2026-09-25', 25),
  ];

  it('editing a past success into a failure lowers the current target', () => {
    const edited = [base[0]!, base[1]!, session('2026-09-25', 25, FAIL)];
    expect(replayLinear(squat, 20, base).weight).toBe(27.5);
    expect(replayLinear(squat, 20, edited).weight).toBe(25);
  });

  it('deleting the last session rolls the target back', () => {
    expect(replayLinear(squat, 20, base.slice(0, 2)).weight).toBe(25);
  });

  it('editing an old session only changes what follows from it', () => {
    // Later sessions are snapshots of what was lifted; they still drive the result.
    const edited = [session('2026-09-21', 20, FAIL), base[1]!, base[2]!];
    expect(replayLinear(squat, 20, edited).weight).toBe(27.5);
  });

  it('removing one failure from a streak prevents the deload', () => {
    const fails = [
      session('2026-09-21', 60, FAIL),
      session('2026-09-23', 60, FAIL),
      session('2026-09-25', 60, FAIL),
    ];
    expect(replayLinear(squat, 60, fails).weight).toBe(55);
    // fail 60 → success 60 (→ 62.5) → the user still loaded 60 and failed: repeat 60, no deload.
    const edited = [fails[0]!, session('2026-09-23', 60), fails[2]!];
    expect(replayLinear(squat, 60, edited)).toMatchObject({ weight: 60, failStreak: 1 });
  });

  it('is deterministic and independent of input order', () => {
    const shuffled = [base[2]!, base[0]!, base[1]!];
    expect(replayLinear(squat, 20, shuffled)).toEqual(replayLinear(squat, 20, base));
  });
});

describe('reps progression', () => {
  const pushups: RepsProgression = { kind: 'reps', increment: 1, maxReps: 12 };
  const bw = (date: string, target: number, reps: number[]): SessionEvent => ({
    type: 'session',
    date,
    sets: reps.map((r) => ({ targetReps: target, repsDone: r, weight: null })),
  });

  it('starts at the configured reps', () => {
    expect(replayReps(pushups, 10, [])).toEqual({ reps: 10, atMax: false });
  });

  it('adds a rep per set after a successful session', () => {
    expect(replayReps(pushups, 10, [bw('2026-09-21', 10, [10, 10, 10])]).reps).toBe(11);
  });

  it('keeps the target after a failed session', () => {
    expect(replayReps(pushups, 10, [bw('2026-09-21', 10, [10, 9, 8])]).reps).toBe(10);
  });

  it('stops at the maximum and flags "consider adding weight"', () => {
    const events = [bw('2026-09-21', 11, [11, 11, 11]), bw('2026-09-23', 12, [12, 12, 12])];
    expect(replayReps(pushups, 11, events)).toEqual({ reps: 12, atMax: true });
  });

  it('replays from logged targets after an edit', () => {
    const events = [bw('2026-09-21', 10, [10, 10, 10]), bw('2026-09-23', 11, [11, 11, 9])];
    expect(replayReps(pushups, 10, events).reps).toBe(11);
  });
});

describe('step progression', () => {
  const easyRun: StepProgression = { kind: 'step', field: 'duration_min', amount: 5, everyWeeks: 2, cap: 45 };
  const intervals: StepProgression = { kind: 'step', field: 'work_s', amount: 30, everyWeeks: 1, cap: 480 };
  const distance: StepProgression = { kind: 'step', field: 'distance_km', amount: 0.5, everyWeeks: 1, cap: 10 };
  const start = '2026-09-28'; // Monday

  it('easy run: 30 min, +5 every 2 weeks, capped at 45', () => {
    expect(stepValue(30, easyRun, start, '2026-09-29')).toBe(30); // week 0
    expect(stepValue(30, easyRun, start, '2026-10-06')).toBe(30); // week 1
    expect(stepValue(30, easyRun, start, '2026-10-13')).toBe(35); // week 2
    expect(stepValue(30, easyRun, start, '2026-10-27')).toBe(40); // week 4
    expect(stepValue(30, easyRun, start, '2026-11-10')).toBe(45); // week 6
    expect(stepValue(30, easyRun, start, '2026-12-15')).toBe(45); // capped
  });

  it('beginner intervals: work time +30 s every week up to 8 min', () => {
    expect(stepValue(60, intervals, start, start)).toBe(60);
    expect(stepValue(60, intervals, start, '2026-10-05')).toBe(90);
    expect(stepValue(60, intervals, start, '2027-03-01')).toBe(480);
  });

  it('distance steps stay free of float noise', () => {
    expect(stepValue(3, distance, start, '2026-10-19')).toBe(4.5); // week 3
  });

  it('returns the base before the start date', () => {
    expect(stepValue(30, easyRun, start, '2026-09-01')).toBe(30);
  });

  it('does not lower a base that is already above the cap', () => {
    expect(stepValue(50, easyRun, start, '2026-11-10')).toBe(50);
  });
});

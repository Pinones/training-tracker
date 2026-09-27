// Row types mirrored 1:1 from the Supabase tables (see plan.md §6).
// Weights in kg, distances in km. Timestamps are ISO strings; dates are 'YYYY-MM-DD'.

import type {
  ISODate,
  ItemConfig,
  ItemType,
  Progression,
  SessionStatus,
  SlotKind,
  UUID,
  Weekday,
} from '../logic/types';

/** Columns every synced table has. */
export interface BaseRow {
  id: UUID; // generated on the device
  user_id: UUID | null; // null only for global seed exercises
  created_at: string;
  /** set by a server trigger; the device writes its own clock until the server stamps it */
  updated_at: string;
  /** soft delete: never remove rows, set this instead */
  deleted_at: string | null;
}

export interface ProfileRow extends BaseRow {
  display_name: string;
  timezone: string;
  track_bodyweight: boolean;
  bw_goal_kg: number | null;
}

export interface ExerciseRow extends BaseRow {
  name: string;
  category: 'barbell_gym' | 'bodyweight' | 'conditioning' | 'running' | 'custom';
  default_type: ItemType;
  default_increment: number;
  is_barbell: boolean;
  is_global: boolean;
}

export type PlanStatus = 'draft' | 'active' | 'archived';

export interface PlanRow extends BaseRow {
  name: string;
  goal_text: string;
  start_date: ISODate;
  weeks: number | null; // null = ongoing
  status: PlanStatus;
  template_key: string | null;
}

export interface PlanWorkoutRow extends BaseRow {
  plan_id: UUID;
  name: string;
  sort_order: number;
}

export interface PlanItemRow extends BaseRow {
  workout_id: UUID;
  exercise_id: UUID | null; // null for run/free items
  type: ItemType;
  sort_order: number;
  config: ItemConfig;
  progression: Progression;
}

export interface PlanRotationRow extends BaseRow {
  plan_id: UUID;
  name: string;
  workout_ids: UUID[];
}

export interface PlanScheduleRow extends BaseRow {
  plan_id: UUID;
  weekday: Weekday;
  slot_kind: SlotKind;
  workout_id: UUID | null;
  rotation_id: UUID | null;
}

export interface SessionRow extends BaseRow {
  plan_id: UUID | null;
  workout_id: UUID | null;
  date: ISODate;
  status: SessionStatus;
  started_at: string | null;
  finished_at: string | null;
  notes: string;
}

export interface SessionItemRow extends BaseRow {
  session_id: UUID;
  exercise_id: UUID | null;
  type: ItemType;
  sort_order: number;
  /** snapshot of the item and its targets at the time; never re-derived from the plan */
  prescribed: ItemConfig & { name: string };
  result: {
    duration_s?: number;
    distance_km?: number;
    rounds?: number;
    effort?: number;
    seconds?: number[];
    done?: boolean;
    skipped?: boolean;
  };
}

export interface SetLogRow extends BaseRow {
  session_item_id: UUID;
  set_index: number;
  target_reps: number;
  reps_done: number | null;
  weight: number | null;
  is_hard: boolean;
}

export interface WeightOverrideRow extends BaseRow {
  exercise_id: UUID;
  weight: number;
  effective_date: ISODate;
}

export interface BodyweightRow extends BaseRow {
  date: ISODate; // unique per user
  weight: number;
}

export interface ReminderSettingsRow extends BaseRow {
  enabled: boolean;
  time_local: string; // 'HH:MM', 24-hour
  weekdays: Weekday[];
  weigh_in_weekdays: Weekday[];
}

export interface PushSubscriptionRow extends BaseRow {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  device_label: string;
}

export interface DailyBriefRow extends BaseRow {
  date: ISODate;
  title: string;
  body: string;
  sent_at: string | null;
}

export interface SyncedTables {
  profiles: ProfileRow;
  exercises: ExerciseRow;
  plans: PlanRow;
  plan_workouts: PlanWorkoutRow;
  plan_items: PlanItemRow;
  plan_rotations: PlanRotationRow;
  plan_schedule: PlanScheduleRow;
  sessions: SessionRow;
  session_items: SessionItemRow;
  set_logs: SetLogRow;
  weight_overrides: WeightOverrideRow;
  bodyweights: BodyweightRow;
  reminder_settings: ReminderSettingsRow;
  push_subscriptions: PushSubscriptionRow;
  daily_briefs: DailyBriefRow;
}

export type SyncedTableName = keyof SyncedTables;

// ---------- Local-only tables ----------

/** A pending change waiting to be pushed to Supabase. */
export interface OutboxEntry {
  seq?: number; // auto-increment, gives push order
  table: SyncedTableName;
  row_id: UUID;
  queued_at: string;
}

/** Key/value store for sync cursors, the signed-in user, one-time hints, etc. */
export interface MetaEntry {
  key: string;
  value: unknown;
}

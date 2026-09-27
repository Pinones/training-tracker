-- Training Tracker: initial schema (plan.md §2, §6).
--
-- Data-safety design:
--  * ids are UUIDs generated on the device; pushes are idempotent upserts on id.
--  * updated_at is always stamped by the server (trigger) and drives incremental pulls.
--  * soft deletes only: clients have NO delete policy, so rows can never be hard-deleted
--    from the app. Only deleting the auth user (delete_my_account) cascades the data away.
--  * no foreign keys between user tables: an offline batch that arrives out of order must
--    never be rejected. Integrity between rows is the client's job; every row belongs to
--    auth.users via user_id (on delete cascade).
--  * RLS on every table: user_id = auth.uid().

-- ---------------------------------------------------------------------------
-- Shared trigger: server-stamped updated_at; id, user_id and created_at are immutable.
-- ---------------------------------------------------------------------------
create or replace function public.stamp_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  display_name text not null default '',
  timezone text not null default 'Europe/Stockholm',
  track_bodyweight boolean not null default true,
  bw_goal_kg numeric(5, 2)
);

create table public.exercises (
  id uuid primary key,
  user_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  name text not null,
  category text not null check (category in ('barbell_gym', 'bodyweight', 'conditioning', 'running', 'custom')),
  default_type text not null check (default_type in ('weight_reps', 'bodyweight_reps', 'timed', 'run_continuous', 'run_intervals', 'free')),
  default_increment numeric(5, 2) not null default 0,
  is_barbell boolean not null default false,
  is_global boolean not null default false,
  -- global seed rows have no owner; user rows always do
  constraint exercises_owner check (is_global = (user_id is null))
);

create table public.plans (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  name text not null,
  goal_text text not null default '',
  start_date date not null,
  weeks integer check (weeks is null or weeks > 0),
  status text not null check (status in ('draft', 'active', 'archived')),
  template_key text
);

create table public.plan_workouts (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  plan_id uuid not null,
  name text not null,
  sort_order integer not null default 0
);

create table public.plan_items (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  workout_id uuid not null,
  exercise_id uuid,
  type text not null check (type in ('weight_reps', 'bodyweight_reps', 'timed', 'run_continuous', 'run_intervals', 'free')),
  sort_order integer not null default 0,
  config jsonb not null default '{}',
  progression jsonb not null default '{"kind": "none"}'
);

create table public.plan_rotations (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  plan_id uuid not null,
  name text not null,
  workout_ids uuid[] not null default '{}'
);

create table public.plan_schedule (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  plan_id uuid not null,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Monday
  slot_kind text not null check (slot_kind in ('rest', 'workout', 'rotation')),
  workout_id uuid,
  rotation_id uuid
);

create table public.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  plan_id uuid,
  workout_id uuid,
  date date not null,
  status text not null check (status in ('in_progress', 'completed', 'skipped')),
  started_at timestamptz,
  finished_at timestamptz,
  notes text not null default ''
);

create table public.session_items (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  session_id uuid not null,
  exercise_id uuid,
  type text not null check (type in ('weight_reps', 'bodyweight_reps', 'timed', 'run_continuous', 'run_intervals', 'free')),
  sort_order integer not null default 0,
  prescribed jsonb not null default '{}', -- snapshot of the targets at the time
  result jsonb not null default '{}'
);

create table public.set_logs (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  session_item_id uuid not null,
  set_index integer not null,
  target_reps integer not null,
  reps_done integer,
  weight numeric(6, 2), -- kg
  is_hard boolean not null default false
);

create table public.weight_overrides (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  exercise_id uuid not null,
  weight numeric(6, 2) not null, -- kg
  effective_date date not null
);

create table public.bodyweights (
  id uuid primary key, -- derived from (user_id, date) on the device, so it is the same everywhere
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  date date not null,
  weight numeric(5, 2) not null, -- kg
  unique (user_id, date)
);

create table public.reminder_settings (
  id uuid primary key,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  enabled boolean not null default false,
  time_local text not null default '07:00' check (time_local ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  weekdays smallint[] not null default '{}',
  weigh_in_weekdays smallint[] not null default '{}'
);

create table public.push_subscriptions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  endpoint text not null,
  keys jsonb not null,
  device_label text not null default ''
);

create table public.daily_briefs (
  id uuid primary key, -- derived from (user_id, date) on the device
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  date date not null,
  title text not null,
  body text not null,
  sent_at timestamptz,
  unique (user_id, date)
);

-- ---------------------------------------------------------------------------
-- Triggers, RLS policies and the pull index, applied uniformly to every table.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'exercises', 'plans', 'plan_workouts', 'plan_items', 'plan_rotations',
    'plan_schedule', 'sessions', 'session_items', 'set_logs', 'weight_overrides',
    'bodyweights', 'reminder_settings', 'push_subscriptions', 'daily_briefs'
  ] loop
    execute format('create trigger stamp_row before insert or update on public.%I
                    for each row execute function public.stamp_row()', t);

    -- incremental pull: where user_id = me and (updated_at, id) > cursor
    execute format('create index %I on public.%I (user_id, updated_at, id)', t || '_pull_idx', t);

    execute format('alter table public.%I enable row level security', t);

    if t <> 'exercises' then
      execute format('create policy "select own" on public.%I for select to authenticated
                      using (user_id = (select auth.uid()))', t);
      execute format('create policy "insert own" on public.%I for insert to authenticated
                      with check (user_id = (select auth.uid()))', t);
      execute format('create policy "update own" on public.%I for update to authenticated
                      using (user_id = (select auth.uid()))
                      with check (user_id = (select auth.uid()))', t);
      -- deliberately no delete policy: soft deletes only.
    end if;
  end loop;
end;
$$;

-- Exercises: global seed rows are readable by everyone signed in, but only owners can write.
create policy "select own or global" on public.exercises for select to authenticated
  using (is_global or user_id = (select auth.uid()));
create policy "insert own" on public.exercises for insert to authenticated
  with check (user_id = (select auth.uid()) and not is_global);
create policy "update own" on public.exercises for update to authenticated
  using (user_id = (select auth.uid()) and not is_global)
  with check (user_id = (select auth.uid()) and not is_global);

-- Global rows have user_id null, so they need their own pull index.
create index exercises_global_pull_idx on public.exercises (updated_at, id) where is_global;

-- ---------------------------------------------------------------------------
-- New users get a profile row. Its id equals the user id so every device agrees on it.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, user_id, display_name, timezone)
  values (
    new.id,
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'timezone', ''), 'Europe/Stockholm')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Delete account: removes the auth user; every table cascades on user_id.
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Seed: the global exercise library (fixed ids so templates can reference them).
-- ---------------------------------------------------------------------------
insert into public.exercises (id, user_id, name, category, default_type, default_increment, is_barbell, is_global) values
  ('3103076c-c1e6-4c43-bdfb-385f00bf50ac', null, 'Squat',              'barbell_gym',  'weight_reps',     2.5, true,  true),
  ('994c6bbc-6cf5-4d97-806c-9c23d3c051d7', null, 'Bench press',        'barbell_gym',  'weight_reps',     2.5, true,  true),
  ('0b2f9222-21de-4897-8bc2-67b9b506984c', null, 'Deadlift',           'barbell_gym',  'weight_reps',     5,   true,  true),
  ('5d259117-be26-45cc-a763-3303f0e3b13c', null, 'Overhead press',     'barbell_gym',  'weight_reps',     2.5, true,  true),
  ('ae61cd00-40eb-4a48-b4c8-70988f846e3a', null, 'Barbell row',        'barbell_gym',  'weight_reps',     2.5, true,  true),
  ('33ebbcae-e29a-4ead-8b25-0014d0142161', null, 'Romanian deadlift',  'barbell_gym',  'weight_reps',     2.5, true,  true),
  ('cafc5ab6-e684-4fef-a716-5de731ab23fb', null, 'Hip thrust',         'barbell_gym',  'weight_reps',     2.5, true,  true),
  ('342849cc-6275-4e1f-8958-48f6f400b340', null, 'Leg press',          'barbell_gym',  'weight_reps',     5,   false, true),
  ('c31bc998-a790-42fd-8cfb-074c32bb940e', null, 'Lat pulldown',       'barbell_gym',  'weight_reps',     2.5, false, true),
  ('32b479bd-faa2-491b-a91b-60c21a5e95a8', null, 'Seated cable row',   'barbell_gym',  'weight_reps',     2.5, false, true),
  ('1a1a5569-2213-4377-98aa-dbe3b50af1d0', null, 'Dumbbell press',     'barbell_gym',  'weight_reps',     2,   false, true),
  ('5e7db959-ec94-46f4-8479-02f83d856be7', null, 'Lunges',             'barbell_gym',  'weight_reps',     2,   false, true),
  ('b53652b6-2092-49dc-af9f-fbca7dc0c5e3', null, 'Biceps curl',        'barbell_gym',  'weight_reps',     1,   false, true),
  ('20255f98-9030-48a5-b6d5-6d1bc5bba641', null, 'Triceps pushdown',   'barbell_gym',  'weight_reps',     2.5, false, true),
  ('5705dbe9-68a3-4695-a2dc-25edd0fbcc7d', null, 'Calf raise',         'barbell_gym',  'weight_reps',     2.5, false, true),
  ('16bb8026-8e51-4ea0-a86e-023e2b526acc', null, 'Push-ups',           'bodyweight',   'bodyweight_reps', 0,   false, true),
  ('bc5d7adb-e712-4e88-8d44-fd579b4eb7e5', null, 'Pull-ups',           'bodyweight',   'bodyweight_reps', 0,   false, true),
  ('897546e0-48b3-4a66-b0ba-e4725dea9c7e', null, 'Plank',              'bodyweight',   'timed',           0,   false, true),
  ('0b4a4bff-15eb-48ed-a202-719218f0ec92', null, 'Kettlebell swings',  'conditioning', 'timed',           0,   false, true),
  ('ec5f4218-ad95-4294-b1c5-5b46ab026319', null, 'Battle ropes',       'conditioning', 'timed',           0,   false, true),
  ('40fdf464-ff14-432d-a7cd-12999818cf9a', null, 'Bag work',           'conditioning', 'timed',           0,   false, true)
on conflict (id) do nothing;

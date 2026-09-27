Training Tracker: Build Plan
This is a training web app that each person can set up with their own plan. When someone signs up, they fill in a form to choose or build a training plan. The plan is saved to their account, and every workout they log is saved and backed up.

It installs on iPhone from Safari (Share → Add to Home Screen) and works offline. It also sends daily reminders.

Top priority: never lose anyone's progress. Every design decision should favor data safety.

Units: metric only (users are in Sweden). There is no unit setting and no imperial support.

Weights are always in kg.
Running distance is always in km, with pace shown as min/km (for example "5:45 /km").
Time is shown in 24-hour format, weeks start on Monday, and dates use YYYY-MM-DD.
The default timezone is Europe/Stockholm, auto-detected.
Language: English only. All UI text is in English. There's no translation setup, but keep strings in one src/strings.ts file so a translation could be added later.

Instructions for Claude Code:

Build one phase at a time (see section 8) and stop after each phase for review.
Put all training logic in pure, unit-tested functions.
Ask before adding dependencies that aren't listed here.
1. Tech stack
Frontend: React + Vite + TypeScript (strict), React Router, Tailwind CSS.
PWA: vite-plugin-pwa using the injectManifest strategy, with a custom service worker so it can handle push notifications.
Local storage: Dexie (IndexedDB) as the on-device copy of all data.
Backend: Supabase.
Auth with email and password.
Postgres with row-level security (RLS).
Edge Functions, plus pg_cron and pg_net for reminders.
Forms: React Hook Form + Zod, used for the plan builder.
State: Zustand, only for the live workout in progress.
Charts: Recharts.
Push: Web Push with VAPID keys, sent from a Supabase Edge Function using the web-push library.
Tests: Vitest for the logic and sync code, Playwright for the offline and sync scenarios.
Hosting: Vercel (free tier), deploying from a GitHub repo.
iPhone PWA requirements
Manifest: display: standalone, plus app name, icons and theme color.
Apple-specific tags: apple-touch-icon and the Apple web app meta tags.
Safe areas: layouts must respect safe-area insets.
When opened in a normal Safari tab: show a one-time hint explaining how to add the app to the Home Screen. On iPhone, push notifications only work once the app is installed this way.
Enable notifications: only show this button when the app is running from the Home Screen. Only request permission when the user taps it.
2. Data safety rules (non-negotiable)
Save every tap immediately. When a user logs a set, run or weight, write it to IndexedDB at once. There is no "Save" button for logging.
Local-first sync. Every write also goes into an outbox queue. When the device is online, a sync worker pushes the outbox to Supabase using idempotent upserts, then pulls any rows changed since the last sync. Logging must work fully offline in the gym.
IDs and change tracking. IDs are UUIDs generated on the device. Every table has user_id, created_at, updated_at (set by a server trigger) and deleted_at.
Conflicts. The most recent write wins, judged by updated_at. Each person is usually on one device, so conflicts will be rare.
Soft deletes only. Deleting sets deleted_at rather than removing the row. A "Recently deleted" screen in Settings can restore items for 30 days.
History is a snapshot. A logged session stores exactly what was prescribed and done: exercise, weight, reps and targets. Editing or replacing a plan must never change past history.
Sync status is always visible. A small indicator shows either "All saved ✓" or "N changes waiting to sync". If a user tries to log out with unsynced changes, warn them and block the logout.
Persistent storage. Call navigator.storage.persist(). Supabase is the source of truth, so if the phone clears local data, logging in restores everything.
Backup and restore. Settings has "Download my data (JSON)" and "Import from backup". Import must be idempotent, so importing the same file twice creates no duplicates.
Privacy. RLS on every table guarantees users can only read and write their own rows. Include a test that user A cannot read user B's data.
3. Users and accounts
Account screens: sign up, log in, forgot/reset password, change password, delete account. Deleting an account also deletes the user's data after a confirmation step.
Passwords: handled entirely by Supabase Auth. The app never stores passwords itself.
Profile fields: display name, timezone (auto-detected, default Europe/Stockholm), and optional bodyweight tracking with an optional goal in kg.
No sharing between users: each person's plan and history are private.
4. The plan builder (the heart of the app)
A user can have several saved plans, but only one is active at a time. Plans can be created at sign-up, created later, edited, duplicated or archived. Archived plans keep their history.

4.1 Plan builder form (a step-by-step wizard with Back/Next; progress saves as a draft)
Starting point. Pick a template from section 5, or "Build from scratch". A template is copied into the user's own plan, and everything in it stays editable.
Basics. Plan name, start date, length (weeks, or "ongoing"), and goal as free text (for example "lose 10 kg" or "run 5K").
Workouts. Create or edit workouts (for example "Workout A", "Upper body", "Easy run"). Each workout is a list of items from section 4.2. Items can be added from an exercise library or as custom exercises, and reordered by dragging.
Weekly schedule. For each weekday, choose one of three options:
Rest.
A specific workout.
A rotation slot, meaning "next workout from rotation X". For example, a rotation [A, B] creates StrongLifts-style alternation: each rotation slot gets the next workout after the last completed one, regardless of calendar day.
Reminders. Pick a reminder time, the days to be reminded, and whether to add weigh-in reminders and on which days.
Review and save. A readable summary of the whole plan, then Save. After saving, the plan becomes active.
4.2 Workout item types
Type	Fields	Example
weight_reps	sets, reps, start weight, rest seconds, progression	Squat 5×5 @ 20 kg
bodyweight_reps	sets, reps, rest seconds, progression (optional +reps)	Push-ups 3×10
timed	sets, seconds, rest seconds	Plank 3×30 s
run_continuous	target duration (min) and/or distance (km), pace note, progression	Easy run 30 min, or 5 km
run_intervals	warm-up, work time, recovery time, rounds, cool-down, effort note, progression	1 min hard / 2 min easy ×6–8
free	title, description, optional duration	"Finisher: swings/ropes, 10 min 40/20"
Any item can be marked optional.

4.3 Progression rules (configurable per item)
None: targets stay fixed.
Linear (weight): if every set hits its target reps, add a set increment next time (for example +2.5 kg). After N failed sessions in a row at the same weight (default 3), drop by X% (default 10%). Round to the nearest plate step (default 2.5 kg) and never go below a minimum (default 20 kg for barbell lifts).
Reps: after a successful session, add +1 rep per set, up to a maximum. When the maximum is reached, show "consider adding weight".
Step: add +X to a value every N weeks, up to a cap. This applies to run duration (min), run distance (km, for example +0.5 km every week), or interval work time.
Progression state (current weight, failure streak, current target) is derived by replaying the session history for that exercise with pure functions. It is never stored as a separate value that gets edited in place.

Users can manually override an exercise's current weight. The override is stored as a dated event that the replay respects.

Progression is tracked per exercise, not per plan. If a user switches plans, their squat history and current weight carry over.

4.4 Exercise library
The library comes pre-loaded with common exercises. Each has a name, category, default item type, default increment, and whether it uses a barbell.

Barbell and gym: squat, bench press, deadlift, overhead press, barbell row, Romanian deadlift, hip thrust, leg press, lat pulldown, seated cable row, dumbbell press, lunges, biceps curl, triceps pushdown, calf raise.
Bodyweight: push-ups, pull-ups, plank.
Conditioning: kettlebell swings, battle ropes, bag work.
Users can add custom exercises. Custom exercises are private to that user.

5. Starter templates (seed data)
1. Hybrid StrongLifts 5x5 + running. This is the owner's plan. It runs 12 weeks, 5 sessions a week.

Workout A: squat, bench press, barbell row. All 5×5, linear +2.5 kg, starting at 20 kg.
Workout B: squat 5×5, overhead press 5×5, deadlift 1×5. Deadlift is linear +5 kg starting at 40 kg; the others +2.5 kg from 20 kg.
Rest times: 90 s default, with a "Hard set" button for 3 min and 5 min after a failed set.
Deload: after 3 failed sessions in a row, drop 10%, never below 20 kg.
Schedule:
Day	Session
Mon	Rotation [A, B]
Tue	Easy run: 30 min, step +5 min every 2 weeks, cap 45. Note: conversational pace.
Wed	Rotation [A, B]
Thu	Rest
Fri	Rotation [A, B] + optional free item "Finisher: swings, ropes or bag, 10 min, 40 s on / 20 s off"
Sat	Intervals: 10 min warm-up, 1 min hard / 2 min easy × 6–8, 5–10 min cool-down. Note: hard means 8 out of 10 effort.
Sun	Rest
2. Full body, 3 days. Mon / Wed / Fri, rotating [A, B].

A: squat 3×8, bench press 3×8, barbell row 3×8, plank 3×30 s.
B: Romanian deadlift 3×8, overhead press 3×8, lat pulldown 3×10, lunges 3×10.
Progression: linear +2.5 kg.
3. Upper/Lower, 4 days. Mon Upper, Tue Lower, Thu Upper, Fri Lower.

Upper: bench press 3×8, barbell row 3×8, overhead press 3×10, lat pulldown 3×10, biceps curl 2×12.
Lower: squat 3×8, Romanian deadlift 3×8, leg press 3×10, hip thrust 3×10, calf raise 2×15.
4. Beginner running, 3 days. Mon / Wed / Sat.

5 min warm-up walk, then run 1 min / walk 2 min × 8, then a 5 min cool-down.
Work time steps +30 s every week, up to a cap of 8 min.
5. Build from scratch. Starts with an empty plan.

6. Data model (Supabase Postgres, mirrored in Dexie)
Every table includes id uuid, user_id, created_at, updated_at and deleted_at. Every table has RLS enabled with the policy user_id = auth.uid().

profiles            display_name, timezone, track_bodyweight, bw_goal_kg
                    -- all weights stored in kg, all distances in km (numeric, 2 decimals)

exercises           name, category, default_type, default_increment, is_barbell,
                    is_global (seed rows, readable by all, user_id null)

plans               name, goal_text, start_date, weeks (nullable = ongoing),
                    status ('draft'|'active'|'archived'), template_key

plan_workouts       plan_id, name, sort_order

plan_items          workout_id, exercise_id (nullable for run/free), type, sort_order,
                    config jsonb   -- sets, reps, start_weight, rest_s, targets, optional flag
                    progression jsonb -- {kind:'none'|'linear'|'reps'|'step', ...params}

plan_rotations      plan_id, name, workout_ids uuid[]

plan_schedule       plan_id, weekday (0=Mon..6=Sun),
                    slot_kind ('rest'|'workout'|'rotation'), workout_id, rotation_id

sessions            plan_id, workout_id, date, status ('in_progress'|'completed'|'skipped'),
                    started_at, finished_at, notes

session_items       session_id, exercise_id, type, sort_order,
                    prescribed jsonb   -- snapshot of targets at the time
                    result jsonb       -- run duration/distance/rounds, timed seconds, done flag

set_logs            session_item_id, set_index, target_reps, reps_done, weight, is_hard

weight_overrides    exercise_id, weight, effective_date

bodyweights         date (unique per user), weight

reminder_settings   enabled, time_local, weekdays int[], weigh_in_weekdays int[]

push_subscriptions  endpoint, keys jsonb, device_label

daily_briefs        date, title, body, sent_at   -- see 7.3
7. Screens and features
7.1 Navigation
The bottom tabs are Today, History, Progress, Body (hidden if bodyweight tracking is off), and Settings.

7.2 Screens
Today.

Shows today's slot from the active plan. For a rotation slot, it resolves which workout is next.
Shows each item with its current target and weight, a "Start" button, and a 7-day strip showing done, missed, planned and rest days.
A "Do a different workout" option lets the user swap in any workout from the plan.
Active workout.

Strength items: tappable set circles. Tapping marks a set done at target reps. Long-pressing lets the user enter fewer reps, which counts as a failure.
Timed items: a countdown.
Run items: a quick form for duration (min:sec), distance (km, with decimal input such as 5.2), rounds and effort (1–10). Pace (min/km) is calculated automatically and shown.
Free items: a done/skip toggle.
In-app rest timer: a sticky bottom bar with countdown, +30 s, Skip, and a "Hard" button when configured. Plays a sound at 0:00. There are no push notifications for rest.
Keep screen awake: use the Screen Wake Lock API during a workout, with a toggle.
Autosave: every change is saved immediately. If the app is closed mid-workout, the workout resumes when it's reopened.
Finish: shows a summary with next targets, new PRs and any deloads.
History.

Sessions in date order, newest first.
Any session can be opened, edited or deleted (soft delete). Changes trigger a replay so future targets stay correct.
Progress.

A chart of working weight over time for each exercise, with a picker to choose the exercise.
Personal records.
Running: total km per week and month, longest run (km), best pace (min/km), and a chart of distance and pace over time.
Adherence: completed versus planned sessions per week.
Body.

Quick entry for today's weight.
A chart showing daily points, a weekly average line (Monday to Sunday), and the goal line.
A plateau hint: if the weekly average hasn't dropped in 2 weeks, suggest a small calorie reduction.
Plans.

Reached from Settings or a Today header menu.
Lists all plans, with create (the wizard), edit, duplicate, activate and archive.
Settings.

Profile and password.
Reminders and the button to enable notifications.
Recently deleted items.
Export and import.
Delete account.
Sync status details.
7.3 Daily reminders (push)
Precompute the reminder text on the device. Whenever a session is logged or the plan changes, the client writes daily_briefs for the next 14 days. Examples:

"Workout B today: Squat 42.5 kg, OHP 25 kg, Deadlift 60 kg"
"Easy run today: 35 min"
"Weigh-in morning"
Rest days get no reminder unless the user asked for a weigh-in reminder that day.
This keeps the progression logic in one place: the server never recalculates it.

Sending: a Supabase Edge Function send-reminders runs every 15 minutes via pg_cron. It finds users whose local reminder time falls in the last window and whose brief for today hasn't been sent. It sends Web Push to each of their subscriptions and sets sent_at.

Dead subscriptions: remove subscriptions that return 404 or 410.

Test button: Settings has a "Send test notification" button.

8. Build phases (stop for review after each)
Phase 1: Foundation

Scaffold the Vite, React, TypeScript, Tailwind and PWA setup, with routing and tabs.
Set up the Dexie schema.
Write src/logic/ with Vitest tests for:
Rotation resolution.
Linear progression with deload, rounding and the minimum weight.
Reps progression.
Step progression.
Replay after editing history.
Weekly bodyweight average.
Deploy to Vercel.
Done when: the app installs to the iPhone Home Screen and opens full screen.
Phase 2: Accounts and cloud saving

Create the Supabase schema, RLS, triggers and seed exercises.
Build the auth screens and profile.
Build the sync engine with outbox, pull and sync indicator.
Build export and import.
Build the Body tab as the first real data feature.
Done when:
A weight logged in airplane mode syncs after reconnecting.
Logging in on a second device shows all the data.
After clearing the site data and logging in again, everything is restored.
User A cannot read user B's data (automated test).
Importing the same backup twice creates no duplicates.
Phase 3: Plan builder

Build the wizard, the templates, the exercise library, plan management and the draft autosave.
Done when: both the StrongLifts hybrid template and a from-scratch plan can be created, saved, edited and activated, and they survive a reload and a second device.
Phase 4: Today and workout logging

Build the Today screen, the active workout screen for all item types, the rest timer, wake lock, resume-after-close and the finish summary.
Done when: a full A → B → A cycle, a run and an interval session are logged, and the weights progress correctly.
Phase 5: History and progress

Build the History list with edit and soft delete (triggering a replay), the Progress charts, PRs and adherence, and "Recently deleted".
Phase 6: Daily reminders

Set up VAPID keys, the push subscription flow, daily_briefs generation, the send-reminders function with cron, and the test notification button.
Done when: a reminder arrives on an iPhone with the app installed on the Home Screen at the chosen time.
Phase 7: Polish

Empty states, dark mode, the app icon, the Add to Home Screen hint, accessibility checks, and a final pass on the offline and sync tests.
9. Owner setup checklist (done by hand, Claude Code will guide)
 Create a GitHub repo.
 Create a free Supabase project, choosing a region close to you. Copy the project URL and anon key into .env.
 Create a free Vercel account, import the repo, and add the same environment variables.
 Add the VAPID keys (Claude Code generates them) as Supabase secrets.
 Once there are real users, set up custom SMTP in Supabase. The built-in email sender is rate-limited and only meant for testing.
 On each iPhone: open the site in Safari, tap Share, then Add to Home Screen. Open the app from the icon and enable notifications in Settings.
10. Later ideas (don't build now)
Nutrition and protein tracker.
Sharing progress with a training partner.
Apple Health import.
Plate calculator.
Warm-up set suggestions.
A coach or AI plan suggestions.
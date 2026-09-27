import { useState } from 'react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Controller, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button, Card, SectionTitle } from '../components/ui';
import { DayChips, NumberInput, Select, TextInput } from '../components/form';
import { newId } from '../db/ids';
import type { ExerciseRow } from '../db/types';
import { describeFlags, describeItem, describeProgression } from '../logic/describe';
import { removeRotation, removeWorkout, sessionsPerWeek, type DraftItem, type DraftWorkout, type PlanDraft } from '../logic/plan';
import type { Weekday } from '../logic/types';
import { strings } from '../strings';
import { ExercisePicker } from './ExercisePicker';
import { ItemEditor } from './ItemEditor';

const s = strings.plans;

function errorAt(errors: unknown, path: string): string | undefined {
  let node = errors;
  for (const key of path.split('.')) node = (node as Record<string, unknown> | undefined)?.[key];
  const e = node as { message?: string; root?: { message?: string } } | undefined;
  return e?.message ?? e?.root?.message;
}

function itemName(item: DraftItem, exercises: Map<string, ExerciseRow>) {
  return item.exercise_id ? exercises.get(item.exercise_id)?.name : undefined;
}

// ---------- 1. Basics ----------

export function BasicsStep() {
  const { register, control, formState } = useFormContext<PlanDraft>();
  const { errors } = formState;
  return (
    <div className="space-y-4">
      <TextInput label={s.name} {...register('name')} error={errors.name?.message} />
      <TextInput label={s.goal} placeholder={s.goalPlaceholder} {...register('goal_text')} error={errors.goal_text?.message} />
      <TextInput label={s.startDate} type="date" {...register('start_date')} error={errors.start_date?.message} />
      <Controller
        control={control}
        name="weeks"
        render={({ field, fieldState }) => (
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm text-slate-300">{s.length}</legend>
            <label className="flex min-h-11 items-center gap-3">
              <input type="radio" className="h-5 w-5 accent-emerald-400" checked={field.value === null} onChange={() => field.onChange(null)} />
              {s.ongoing}
            </label>
            <label className="flex min-h-11 items-center gap-3">
              <input type="radio" className="h-5 w-5 accent-emerald-400" checked={field.value !== null} onChange={() => field.onChange(12)} />
              {s.fixedWeeks}
            </label>
            {field.value !== null && (
              <NumberInput label={s.weeks} integer value={field.value} onChange={(v) => field.onChange(v ?? Number.NaN)} error={fieldState.error?.message} />
            )}
          </fieldset>
        )}
      />
    </div>
  );
}

// ---------- 2. Workouts ----------

export function WorkoutsStep({ exercises, userId }: { exercises: Map<string, ExerciseRow>; userId: string }) {
  const { control, getValues, setValue, formState } = useFormContext<PlanDraft>();
  const workouts = useFieldArray({ control, name: 'workouts', keyName: '_key' });

  const add = () => workouts.append({ id: newId(), name: s.newWorkoutName(workouts.fields.length + 1), items: [] });
  const remove = (wi: number) => {
    const w = getValues(`workouts.${wi}`);
    if (!window.confirm(s.removeWorkoutConfirm(w.name))) return;
    const next = removeWorkout(getValues(), w.id);
    setValue('rotations', next.rotations, { shouldDirty: true });
    setValue('schedule', next.schedule, { shouldDirty: true });
    workouts.remove(wi);
  };

  return (
    <div className="space-y-4">
      {workouts.fields.map((w, wi) => (
        <WorkoutCard key={w._key} wi={wi} exercises={exercises} userId={userId} onRemove={() => remove(wi)} />
      ))}
      {errorAt(formState.errors, 'workouts') && <p className="text-sm text-red-400">{errorAt(formState.errors, 'workouts')}</p>}
      <Button variant="secondary" className="w-full" onClick={add}>
        + {s.addWorkout}
      </Button>
    </div>
  );
}

function WorkoutCard({
  wi,
  exercises,
  userId,
  onRemove,
}: {
  wi: number;
  exercises: Map<string, ExerciseRow>;
  userId: string;
  onRemove: () => void;
}) {
  const { control, register, formState } = useFormContext<PlanDraft>();
  const items = useFieldArray({ control, name: `workouts.${wi}.items`, keyName: '_key' });
  const values = useWatch({ control, name: `workouts.${wi}.items` }) as DraftItem[] | undefined;
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = items.fields.findIndex((f) => f._key === active.id);
    const to = items.fields.findIndex((f) => f._key === over.id);
    if (from >= 0 && to >= 0) items.move(from, to);
  };

  const listError = errorAt(formState.errors, `workouts.${wi}.items`);
  const nameError = errorAt(formState.errors, `workouts.${wi}.name`);

  return (
    <Card className="p-4">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <TextInput label={s.workoutName} {...register(`workouts.${wi}.name`)} error={nameError} />
        </div>
        <button type="button" onClick={onRemove} className="min-h-11 px-2 text-sm text-slate-400" aria-label={s.removeWorkout}>
          ✕
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.fields.map((f) => f._key)} strategy={verticalListSortingStrategy}>
          <ul className="mt-3 space-y-2">
            {items.fields.map((f, ii) => {
              const item = values?.[ii];
              if (!item) return null;
              const hasError = !!errorAt(formState.errors, `workouts.${wi}.items.${ii}`);
              return (
                <SortableRow key={f._key} id={f._key}>
                  <button type="button" className="min-w-0 flex-1 py-2 text-left" onClick={() => setEditing(ii)}>
                    <span className={`block truncate ${hasError ? 'text-red-400' : ''}`}>{describeItem(item, itemName(item, exercises))}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {[describeFlags(item), item.progression.kind !== 'none' && describeProgression(item.progression)]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </button>
                </SortableRow>
              );
            })}
          </ul>
        </SortableContext>
      </DndContext>
      {items.fields.length === 0 && <p className="mt-3 text-sm text-slate-500">{s.noItems}</p>}
      {listError && <p className="mt-2 text-sm text-red-400">{listError}</p>}

      <Button variant="secondary" className="mt-3 w-full" onClick={() => setPicking(true)}>
        + {s.addItem}
      </Button>

      <ExercisePicker
        open={picking}
        onClose={() => setPicking(false)}
        exercises={exercises}
        userId={userId}
        onPick={(item) => {
          items.append(item);
          setPicking(false);
          setEditing(items.fields.length);
        }}
      />
      {editing !== null && values?.[editing] && (
        <ItemEditor
          path={`workouts.${wi}.items.${editing}`}
          exercises={exercises}
          onClose={() => setEditing(null)}
          onRemove={() => {
            items.remove(editing);
            setEditing(null);
          }}
        />
      )}
    </Card>
  );
}

function SortableRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-xl bg-slate-950 pl-1 pr-3 ${isDragging ? 'relative z-10 shadow-lg ring-1 ring-accent' : ''}`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={s.dragHandle}
        className="flex min-h-11 w-9 shrink-0 cursor-grab touch-none items-center justify-center text-slate-500"
      >
        ⠿
      </button>
      {children}
    </li>
  );
}

// ---------- 3. Schedule ----------

export function ScheduleStep() {
  const { control, register, getValues, setValue, formState } = useFormContext<PlanDraft>();
  const rotations = useFieldArray({ control, name: 'rotations', keyName: '_key' });
  const workouts = (useWatch({ control, name: 'workouts' }) ?? []) as DraftWorkout[];
  const rotationValues = (useWatch({ control, name: 'rotations' }) ?? []) as PlanDraft['rotations'];
  const schedule = (useWatch({ control, name: 'schedule' }) ?? []) as PlanDraft['schedule'];
  const workoutName = (id: string) => workouts.find((w) => w.id === id)?.name ?? '?';

  const addRotation = () =>
    rotations.append({
      id: newId(),
      name: s.newRotationName(rotations.fields.length + 1),
      workout_ids: workouts.slice(0, 2).map((w) => w.id),
    });
  const removeRot = (ri: number) => {
    const next = removeRotation(getValues(), getValues(`rotations.${ri}.id`));
    setValue('schedule', next.schedule, { shouldDirty: true });
    rotations.remove(ri);
  };

  const setDay = (day: Weekday, value: string) => {
    const [kind, id] = value.split(':') as ['rest' | 'w' | 'r', string | undefined];
    const current = getValues(`schedule.${day}`);
    setValue(
      `schedule.${day}`,
      {
        ...current,
        slot_kind: kind === 'rest' ? 'rest' : kind === 'w' ? 'workout' : 'rotation',
        workout_id: kind === 'w' ? id! : null,
        rotation_id: kind === 'r' ? id! : null,
      },
      { shouldDirty: true, shouldValidate: formState.isSubmitted },
    );
  };

  return (
    <div className="space-y-2">
      <SectionTitle>{s.weekSchedule}</SectionTitle>
      <Card className="divide-y divide-slate-800">
        {schedule.map((d) => {
          const value = d.slot_kind === 'workout' ? `w:${d.workout_id}` : d.slot_kind === 'rotation' ? `r:${d.rotation_id}` : 'rest';
          const error = errorAt(formState.errors, `schedule.${d.weekday}.workout_id`) ?? errorAt(formState.errors, `schedule.${d.weekday}.rotation_id`);
          return (
            <div key={d.weekday} className="flex items-center gap-3 px-4 py-2">
              <span className="w-10 shrink-0 font-medium">{strings.weekdaysShort[d.weekday]}</span>
              <div className="flex-1">
                <Select aria-label={strings.weekdaysLong[d.weekday]} value={value} onChange={(e) => setDay(d.weekday, e.target.value)} error={error}>
                  <option value="rest">{s.slotRest}</option>
                  {workouts.map((w) => (
                    <option key={w.id} value={`w:${w.id}`}>
                      {s.slotWorkout(w.name)}
                    </option>
                  ))}
                  {rotationValues.map((r) => (
                    <option key={r.id} value={`r:${r.id}`}>
                      {s.slotRotation(r.name)}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          );
        })}
      </Card>
      <p className="text-sm text-slate-400">{strings.describe.perWeek(sessionsPerWeek({ schedule } as PlanDraft))}</p>
      {errorAt(formState.errors, 'schedule') && <p className="text-sm text-red-400">{errorAt(formState.errors, 'schedule')}</p>}

      <SectionTitle>{s.rotations}</SectionTitle>
      <p className="text-sm text-slate-400">{s.rotationsHint}</p>
      {rotations.fields.map((r, ri) => {
        const ids = rotationValues[ri]?.workout_ids ?? [];
        return (
          <Card key={r._key} className="space-y-3 p-4">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <TextInput label={s.rotationName} {...register(`rotations.${ri}.name`)} />
              </div>
              <button type="button" onClick={() => removeRot(ri)} className="min-h-11 px-2 text-sm text-slate-400" aria-label={s.removeRotation}>
                ✕
              </button>
            </div>
            <ol className="flex flex-wrap gap-2">
              {ids.map((id, i) => (
                <li key={`${id}-${i}`} className="flex items-center gap-1 rounded-xl bg-slate-800 py-1 pl-3 pr-1 text-sm">
                  {i + 1}. {workoutName(id)}
                  <button
                    type="button"
                    aria-label={`Remove ${workoutName(id)}`}
                    className="min-h-9 min-w-9 text-slate-400"
                    onClick={() => setValue(`rotations.${ri}.workout_ids`, ids.filter((_, j) => j !== i), { shouldDirty: true })}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ol>
            {errorAt(formState.errors, `rotations.${ri}.workout_ids`) && (
              <p className="text-xs text-red-400">{errorAt(formState.errors, `rotations.${ri}.workout_ids`)}</p>
            )}
            <Select
              aria-label={s.addToRotation}
              value=""
              onChange={(e) => e.target.value && setValue(`rotations.${ri}.workout_ids`, [...ids, e.target.value], { shouldDirty: true })}
            >
              <option value="">{s.addToRotation}</option>
              {workouts.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </Card>
        );
      })}
      <Button variant="secondary" className="w-full" onClick={addRotation} disabled={workouts.length === 0}>
        + {s.addRotation}
      </Button>
    </div>
  );
}

// ---------- 4. Reminders ----------

export function RemindersStep({ trackBodyweight }: { trackBodyweight: boolean }) {
  const { control, register, formState } = useFormContext<PlanDraft>();
  const enabled = useWatch({ control, name: 'reminders.enabled' });
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">{s.remindersHint}</p>
      <label className="flex min-h-11 items-center justify-between">
        <span>{s.remindersOn}</span>
        <input type="checkbox" className="h-6 w-6 accent-emerald-400" {...register('reminders.enabled')} />
      </label>
      {enabled && (
        <>
          <TextInput label={s.reminderTime} type="time" {...register('reminders.time_local')} error={formState.errors.reminders?.time_local?.message} />
          <Controller
            control={control}
            name="reminders.weekdays"
            render={({ field }) => <DayChips label={s.reminderDays} value={field.value} onChange={field.onChange} />}
          />
          {trackBodyweight && (
            <Controller
              control={control}
              name="reminders.weigh_in_weekdays"
              render={({ field }) => <DayChips label={s.weighIns} value={field.value} onChange={field.onChange} />}
            />
          )}
        </>
      )}
    </div>
  );
}

// ---------- 5. Review ----------

export function ReviewStep({ exercises }: { exercises: Map<string, ExerciseRow> }) {
  const { control } = useFormContext<PlanDraft>();
  const plan = useWatch({ control }) as PlanDraft;
  const days = (list: Weekday[]) => list.map((d) => strings.weekdaysShort[d]).join(', ');
  const d = strings.describe;
  const slot = (day: PlanDraft['schedule'][number]) =>
    day.slot_kind === 'workout'
      ? plan.workouts.find((w) => w.id === day.workout_id)?.name
      : day.slot_kind === 'rotation'
        ? d.rotation(plan.rotations.find((r) => r.id === day.rotation_id)?.name ?? '?')
        : d.rest;

  return (
    <div className="space-y-2">
      <Card className="space-y-1 p-4">
        <p className="text-xl font-bold">{plan.name || '—'}</p>
        {plan.goal_text && <p className="text-slate-300">{plan.goal_text}</p>}
        <p className="text-sm text-slate-400">
          {[s.startsOn(plan.start_date), plan.weeks ? d.weeks(plan.weeks) : d.ongoing, d.perWeek(sessionsPerWeek(plan))].join(' · ')}
        </p>
      </Card>

      <SectionTitle>{s.reviewSchedule}</SectionTitle>
      <Card className="divide-y divide-slate-800">
        {plan.schedule.map((day) => (
          <div key={day.weekday} className="flex gap-3 px-4 py-2">
            <span className="w-10 shrink-0 text-slate-400">{strings.weekdaysShort[day.weekday]}</span>
            <span className={day.slot_kind === 'rest' ? 'text-slate-500' : ''}>{slot(day)}</span>
          </div>
        ))}
      </Card>

      <SectionTitle>{s.reviewWorkouts}</SectionTitle>
      {plan.workouts.map((w) => (
        <Card key={w.id} className="p-4">
          <p className="mb-2 font-semibold">{w.name}</p>
          <ul className="space-y-2">
            {w.items.map((item) => (
              <li key={item.id}>
                <p>{describeItem(item, itemName(item, exercises))}</p>
                <p className="text-xs text-slate-500">
                  {[describeProgression(item.progression), describeFlags(item)].filter(Boolean).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ))}

      <SectionTitle>{s.reviewReminders}</SectionTitle>
      <Card className="space-y-1 p-4 text-sm">
        <p>{plan.reminders.enabled ? s.remindersSummary(plan.reminders.time_local, days(plan.reminders.weekdays) || '—') : s.remindersOff}</p>
        {plan.reminders.enabled && plan.reminders.weigh_in_weekdays.length > 0 && (
          <p>{s.weighInSummary(days(plan.reminders.weigh_in_weekdays))}</p>
        )}
      </Card>
    </div>
  );
}

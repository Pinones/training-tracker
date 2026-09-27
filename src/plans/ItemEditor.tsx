import { Controller, useFormContext, useWatch, type FieldPath } from 'react-hook-form';
import { Button } from '../components/ui';
import { Checkbox, DayChips, NumberField, Select, Sheet, TextInput } from '../components/form';
import type { ExerciseRow } from '../db/types';
import { defaultProgression } from '../logic/itemDefaults';
import { PROGRESSIONS_FOR, type DraftItem, type PlanDraft } from '../logic/plan';
import type { Progression, Weekday } from '../logic/types';
import { strings } from '../strings';

const s = strings.plans;
type P = FieldPath<PlanDraft>;

/** Edits one item in place; every change is part of the form (and autosaved). */
export function ItemEditor({
  path,
  exercises,
  onClose,
  onRemove,
}: {
  path: `workouts.${number}.items.${number}`;
  exercises: Map<string, ExerciseRow>;
  onClose: () => void;
  onRemove: () => void;
}) {
  const { control, register, setValue, formState } = useFormContext<PlanDraft>();
  const item = useWatch({ control, name: path }) as DraftItem | undefined;
  if (!item) return null;

  const f = (field: string) => `${path}.${field}` as P;
  const err = (field: string) => {
    let node: unknown = formState.errors;
    for (const key of `${path}.${field}`.split('.')) node = (node as Record<string, unknown> | undefined)?.[key];
    return (node as { message?: string } | undefined)?.message;
  };
  const exercise = item.exercise_id ? exercises.get(item.exercise_id) : undefined;
  const title = exercise?.name ?? s.types[item.type];
  const kinds = PROGRESSIONS_FOR[item.type];

  const setKind = (kind: Progression['kind']) =>
    setValue(f('progression'), defaultProgression(kind, item.type, exercise) as never, { shouldDirty: true, shouldValidate: true });

  return (
    <Sheet
      open
      title={title}
      onClose={onClose}
      footer={
        <Button variant="secondary" className="w-full text-red-400" onClick={onRemove}>
          {s.removeItem}
        </Button>
      }
    >
      <div className="space-y-4">
        {err('exercise_id') && <p className="text-sm text-red-400">{err('exercise_id')}</p>}

        {item.type === 'weight_reps' && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <NumberField control={control} name={f('config.sets')} label={s.sets} integer />
              <NumberField control={control} name={f('config.reps')} label={s.reps} integer />
              <NumberField control={control} name={f('config.start_weight')} label={s.startWeight} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <NumberField control={control} name={f('config.rest_s')} label={s.rest} integer />
              <NumberField control={control} name={f('config.hard_rest_s')} label={s.hardRest} integer />
              <NumberField control={control} name={f('config.failed_rest_s')} label={s.failedRest} integer />
            </div>
          </>
        )}

        {item.type === 'bodyweight_reps' && (
          <div className="grid grid-cols-3 gap-3">
            <NumberField control={control} name={f('config.sets')} label={s.sets} integer />
            <NumberField control={control} name={f('config.reps')} label={s.reps} integer />
            <NumberField control={control} name={f('config.rest_s')} label={s.rest} integer />
          </div>
        )}

        {item.type === 'timed' && (
          <div className="grid grid-cols-3 gap-3">
            <NumberField control={control} name={f('config.sets')} label={s.sets} integer />
            <NumberField control={control} name={f('config.seconds')} label={s.seconds} integer />
            <NumberField control={control} name={f('config.rest_s')} label={s.rest} integer />
          </div>
        )}

        {item.type === 'run_continuous' && (
          <>
            <TextInput label={s.label} {...register(f('config.label'))} error={err('config.label')} />
            <div className="grid grid-cols-2 gap-3">
              <NumberField control={control} name={f('config.duration_min')} label={s.durationMin} />
              <NumberField control={control} name={f('config.distance_km')} label={s.distanceKm} />
            </div>
            {err('config.duration_min') && <p className="text-xs text-red-400">{err('config.duration_min')}</p>}
            <TextInput label={s.paceNote} {...register(f('config.pace_note'))} />
          </>
        )}

        {item.type === 'run_intervals' && (
          <>
            <TextInput label={s.label} {...register(f('config.label'))} error={err('config.label')} />
            <div className="grid grid-cols-2 gap-3">
              <NumberField control={control} name={f('config.warmup_min')} label={s.warmupMin} />
              <NumberField control={control} name={f('config.work_s')} label={s.workS} integer />
              <NumberField control={control} name={f('config.recovery_s')} label={s.recoveryS} integer />
              <div />
              <NumberField control={control} name={f('config.rounds_min')} label={s.roundsMin} integer />
              <NumberField control={control} name={f('config.rounds_max')} label={s.roundsMax} integer />
              <NumberField control={control} name={f('config.cooldown_min')} label={s.cooldownMin} />
              <NumberField control={control} name={f('config.cooldown_max_min')} label={s.cooldownMaxMin} />
            </div>
            <TextInput label={s.effortNote} {...register(f('config.effort_note'))} />
          </>
        )}

        {item.type === 'free' && (
          <>
            <TextInput label={s.titleField} {...register(f('config.title'))} error={err('config.title')} />
            <TextInput label={s.description} {...register(f('config.description'))} />
            <NumberField control={control} name={f('config.duration_min')} label={s.durationMin} />
          </>
        )}

        <Controller
          control={control}
          name={f('config.optional')}
          render={({ field }) => (
            <Checkbox label={s.optionalItem} checked={!!field.value} onChange={(e) => field.onChange(e.target.checked || undefined)} />
          )}
        />
        <Controller
          control={control}
          name={f('config.days')}
          render={({ field }) => (
            <div>
              <DayChips
                label={s.onlyOnDays}
                value={(field.value as Weekday[] | undefined) ?? []}
                onChange={(days) => field.onChange(days.length ? days : undefined)}
              />
              <p className="mt-1 text-xs text-slate-500">{s.everyDay}</p>
            </div>
          )}
        />

        {kinds.length > 1 && (
          <section className="space-y-3 rounded-xl border border-slate-800 p-3">
            <Select label={s.progression} value={item.progression.kind} onChange={(e) => setKind(e.target.value as Progression['kind'])}>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {s.progressionKinds[k]}
                </option>
              ))}
            </Select>

            {item.progression.kind === 'linear' && (
              <div className="grid grid-cols-2 gap-3">
                <NumberField control={control} name={f('progression.increment')} label={s.incrementKg} />
                <NumberField control={control} name={f('progression.failuresBeforeDeload')} label={s.failures} integer />
                <NumberField control={control} name={f('progression.deloadPercent')} label={s.deloadPct} />
                <NumberField control={control} name={f('progression.roundTo')} label={s.roundTo} />
                <NumberField control={control} name={f('progression.minWeight')} label={s.minWeight} />
              </div>
            )}

            {item.progression.kind === 'reps' && (
              <div className="grid grid-cols-2 gap-3">
                <NumberField control={control} name={f('progression.increment')} label={s.addReps} integer />
                <NumberField control={control} name={f('progression.maxReps')} label={s.maxReps} integer />
              </div>
            )}

            {item.progression.kind === 'step' && (
              <div className="grid grid-cols-2 gap-3">
                {item.type === 'run_continuous' && (
                  <div className="col-span-2">
                    <Select label={s.stepField} {...register(f('progression.field'))}>
                      <option value="duration_min">{s.stepFields.duration_min}</option>
                      <option value="distance_km">{s.stepFields.distance_km}</option>
                    </Select>
                  </div>
                )}
                <NumberField control={control} name={f('progression.amount')} label={s.stepAmount} />
                <NumberField control={control} name={f('progression.everyWeeks')} label={s.everyWeeks} integer />
                <NumberField control={control} name={f('progression.cap')} label={s.cap} />
              </div>
            )}
          </section>
        )}
      </div>
    </Sheet>
  );
}

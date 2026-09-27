import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '../components/ui';
import { Checkbox, NumberInput, Select, Sheet, TextInput } from '../components/form';
import { db } from '../db/db';
import { newId } from '../db/ids';
import type { ExerciseRow } from '../db/types';
import { baseRow, saveRow } from '../db/write';
import { newFreeItem, newIntervalsItem, newItemForExercise, newRunItem } from '../logic/itemDefaults';
import type { DraftItem } from '../logic/plan';
import type { ItemType } from '../logic/types';
import { strings } from '../strings';

const s = strings.plans;
const CATEGORY_ORDER: ExerciseRow['category'][] = ['barbell_gym', 'bodyweight', 'conditioning', 'running', 'custom'];
const CUSTOM_TYPES: ItemType[] = ['weight_reps', 'bodyweight_reps', 'timed'];

export function ExercisePicker({
  open,
  onClose,
  onPick,
  exercises,
  userId,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (item: DraftItem) => void;
  exercises: Map<string, ExerciseRow>;
  userId: string;
}) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...exercises.values()].filter((e) => !q || e.name.toLowerCase().includes(q));
    return CATEGORY_ORDER.map((cat) => ({ cat, items: list.filter((e) => e.category === cat) })).filter((g) => g.items.length);
  }, [exercises, query]);

  const pick = (item: DraftItem) => {
    onPick(item);
    setQuery('');
    setCreating(false);
  };

  return (
    <Sheet open={open} title={s.pickerTitle} onClose={onClose}>
      {creating ? (
        <CustomExerciseForm userId={userId} onCancel={() => setCreating(false)} onCreated={(ex) => pick(newItemForExercise(ex, newId()))} />
      ) : (
        <div className="space-y-5">
          <TextInput label={s.search} type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />

          {groups.map(({ cat, items }) => (
            <section key={cat}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{s.categories[cat]}</h3>
              <ul className="divide-y divide-slate-800 rounded-xl bg-slate-950">
                {items.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      className="flex min-h-11 w-full items-center justify-between px-4 py-2 text-left"
                      onClick={() => pick(newItemForExercise(e, newId()))}
                    >
                      <span>{e.name}</span>
                      <span className="text-xs text-slate-500">{s.types[e.default_type]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {!query && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{s.special}</h3>
              <ul className="divide-y divide-slate-800 rounded-xl bg-slate-950">
                {[
                  { label: s.addRun, hint: s.addRunHint, make: newRunItem },
                  { label: s.addIntervals, hint: s.addIntervalsHint, make: newIntervalsItem },
                  { label: s.addFree, hint: s.addFreeHint, make: newFreeItem },
                ].map((x) => (
                  <li key={x.label}>
                    <button type="button" className="min-h-11 w-full px-4 py-2 text-left" onClick={() => pick(x.make(newId()))}>
                      <span className="block">{x.label}</span>
                      <span className="block text-xs text-slate-500">{x.hint}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Button variant="secondary" className="w-full" onClick={() => setCreating(true)}>
            {s.newExercise}
          </Button>
        </div>
      )}
    </Sheet>
  );
}

function CustomExerciseForm({
  userId,
  onCancel,
  onCreated,
}: {
  userId: string;
  onCancel: () => void;
  onCreated: (ex: ExerciseRow) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<ItemType>('weight_reps');
  const [barbell, setBarbell] = useState(false);
  const [increment, setIncrement] = useState<number | undefined>(2.5);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const row: ExerciseRow = {
      ...baseRow(userId),
      name: name.trim(),
      category: 'custom',
      default_type: type,
      default_increment: type === 'weight_reps' && increment && increment > 0 ? increment : 0,
      is_barbell: type === 'weight_reps' && barbell,
      is_global: false,
    };
    await saveRow(db, 'exercises', row);
    onCreated(row);
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <TextInput label={s.exerciseName} value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      <Select label={s.exerciseType} value={type} onChange={(e) => setType(e.target.value as ItemType)}>
        {CUSTOM_TYPES.map((t) => (
          <option key={t} value={t}>
            {s.types[t]}
          </option>
        ))}
      </Select>
      {type === 'weight_reps' && (
        <>
          <NumberInput label={s.increment} value={increment} onChange={setIncrement} />
          <Checkbox label={s.usesBarbell} checked={barbell} onChange={(e) => setBarbell(e.target.checked)} />
        </>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={!name.trim()}>
          {s.createAndAdd}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          {strings.common.cancel}
        </Button>
      </div>
    </form>
  );
}

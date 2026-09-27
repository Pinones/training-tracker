import { useEffect, useId, useRef, useState, type ReactNode, type SelectHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { parseDecimal } from '../logic/format';
import type { Weekday } from '../logic/types';
import { strings } from '../strings';

// ---------- Bottom sheet ----------

export function Sheet({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92%] w-full max-w-xl flex-col rounded-t-2xl bg-slate-900 outline-none pb-safe"
      >
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="min-h-11 px-2 font-semibold text-accent">
            {strings.plans.done}
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <footer className="border-t border-slate-800 px-4 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

// ---------- Numbers ----------

const inputClass =
  'min-h-11 w-full rounded-xl border bg-slate-950 px-3 py-2 text-base text-slate-100 outline-none focus:border-accent';

function toText(v: unknown): string {
  return typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
}

/** Text input for numbers: accepts "2,5" and "2.5", stores a number (or undefined when empty). */
export function NumberInput({
  label,
  value,
  onChange,
  onBlur,
  integer,
  error,
  hint,
}: {
  label: string;
  value: unknown;
  onChange: (v: number | undefined) => void;
  onBlur?: () => void;
  integer?: boolean;
  error?: string;
  hint?: string;
}) {
  const id = useId();
  const [text, setText] = useState(toText(value));
  // Follow outside changes (e.g. switching progression kind) without clobbering typing.
  useEffect(() => {
    const parsed = parseDecimal(text);
    if (parsed !== value && !(parsed === null && value === undefined)) setText(toText(value));
  }, [value]);
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-slate-300">
        {label}
      </label>
      <input
        id={id}
        inputMode={integer ? 'numeric' : 'decimal'}
        autoComplete="off"
        className={`${inputClass} ${error ? 'border-red-500' : 'border-slate-700'}`}
        value={text}
        aria-invalid={!!error}
        onBlur={onBlur}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseDecimal(e.target.value);
          onChange(e.target.value.trim() === '' ? undefined : n === null ? Number.NaN : n);
        }}
      />
      {(error || hint) && <p className={`mt-1 text-xs ${error ? 'text-red-400' : 'text-slate-500'}`}>{error ?? hint}</p>}
    </div>
  );
}

export function NumberField<T extends FieldValues>({
  control,
  name,
  label,
  integer,
  hint,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  integer?: boolean;
  hint?: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <NumberInput
          label={label}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          integer={integer}
          hint={hint}
          error={fieldState.error?.message}
        />
      )}
    />
  );
}

// ---------- Text & select ----------

export function TextInput({
  label,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-slate-300">
        {label}
      </label>
      <input id={id} className={`${inputClass} ${error ? 'border-red-500' : 'border-slate-700'}`} aria-invalid={!!error} {...props} />
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

export function Select({
  label,
  error,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string; error?: string }) {
  const id = useId();
  return (
    <div>
      {label && (
        <label htmlFor={id} className="mb-1 block text-sm text-slate-300">
          {label}
        </label>
      )}
      <select id={id} className={`${inputClass} ${error ? 'border-red-500' : 'border-slate-700'}`} {...props}>
        {children}
      </select>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

export function Checkbox({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3">
      <span className="text-slate-300">{label}</span>
      <input type="checkbox" className="h-6 w-6 accent-emerald-400" {...props} />
    </label>
  );
}

// ---------- Weekday chips ----------

export function DayChips({ value, onChange, label }: { value: Weekday[]; onChange: (days: Weekday[]) => void; label: string }) {
  const toggle = (d: Weekday) =>
    onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort((a, b) => a - b));
  return (
    <fieldset>
      <legend className="mb-2 text-sm text-slate-300">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {strings.weekdaysShort.map((name, i) => {
          const on = value.includes(i as Weekday);
          return (
            <button
              key={name}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(i as Weekday)}
              className={`min-h-11 min-w-11 rounded-xl px-2 text-sm font-medium ${on ? 'bg-accent text-slate-950' : 'bg-slate-800 text-slate-300'}`}
            >
              {name}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

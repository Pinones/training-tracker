import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' };

const VARIANTS = {
  primary: 'bg-accent text-slate-950 font-semibold',
  secondary: 'bg-slate-800 text-slate-100',
  danger: 'bg-red-600 text-white font-semibold',
};

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={`min-h-11 rounded-xl px-4 py-2.5 disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-slate-300">{label}</span>
      <input
        className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-base text-slate-100 outline-none focus:border-accent"
        {...props}
      />
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-slate-900 ${className}`}>{children}</div>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-400">{children}</h2>;
}

export function Message({ kind = 'info', children }: { kind?: 'info' | 'error' | 'success'; children: ReactNode }) {
  const color = kind === 'error' ? 'text-red-400' : kind === 'success' ? 'text-accent' : 'text-slate-300';
  return (
    <p role={kind === 'error' ? 'alert' : 'status'} className={`text-sm ${color}`}>
      {children}
    </p>
  );
}

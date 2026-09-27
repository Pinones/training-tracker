import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { Button, Field, Message } from '../components/ui';
import { detectTimezone } from '../logic/dates';
import { supabase } from '../lib/supabase';
import { strings } from '../strings';
import { useAuth } from './AuthProvider';

const s = strings.auth;
const MIN_PASSWORD = 8;

function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center px-4 pt-safe pb-safe">
      <div className="w-full max-w-sm py-10">
        <p className="mb-1 text-sm font-semibold text-accent">{strings.appName}</p>
        <h1 className="mb-6 text-2xl font-bold">{title}</h1>
        {children}
      </div>
    </div>
  );
}

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

export function LoginScreen() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useSubmit();

  if (session) return <Navigate to="/today" replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      navigate('/today', { replace: true });
    });
  };

  return (
    <AuthCard title={s.logIn}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={s.email} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label={s.password} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <Message kind="error">{error}</Message>}
        <Button type="submit" disabled={busy} className="w-full">
          {s.logIn}
        </Button>
      </form>
      <div className="mt-6 space-y-2 text-sm">
        <p>
          <Link to="/forgot-password" className="text-accent">
            {s.forgot}
          </Link>
        </p>
        <p className="text-slate-400">
          {s.noAccount}{' '}
          <Link to="/signup" className="text-accent">
            {s.signUp}
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}

export function SignupScreen() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmSent, setConfirmSent] = useState(false);
  const { busy, error, run } = useSubmit();

  if (session) return <Navigate to="/today" replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (password.length < MIN_PASSWORD) throw new Error(s.passwordTooShort);
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { display_name: name.trim(), timezone: detectTimezone() },
          emailRedirectTo: `${window.location.origin}/today`,
        },
      });
      if (error) throw error;
      if (data.session) navigate('/today', { replace: true });
      else setConfirmSent(true);
    });
  };

  return (
    <AuthCard title={s.signUp}>
      {confirmSent ? (
        <Message kind="success">{s.checkEmail}</Message>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label={s.displayName} autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
          <Field label={s.email} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Field
            label={s.password}
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD}
            hint={s.passwordHint}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <Message kind="error">{error}</Message>}
          <Button type="submit" disabled={busy} className="w-full">
            {s.signUp}
          </Button>
        </form>
      )}
      <p className="mt-6 text-sm text-slate-400">
        {s.haveAccount}{' '}
        <Link to="/login" className="text-accent">
          {s.logIn}
        </Link>
      </p>
    </AuthCard>
  );
}

export function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useSubmit();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
    });
  };

  return (
    <AuthCard title={s.resetTitle}>
      {sent ? (
        <Message kind="success">{s.resetSent}</Message>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label={s.email} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          {error && <Message kind="error">{error}</Message>}
          <Button type="submit" disabled={busy} className="w-full">
            {s.sendReset}
          </Button>
        </form>
      )}
      <p className="mt-6 text-sm">
        <Link to="/login" className="text-accent">
          {s.backToLogin}
        </Link>
      </p>
    </AuthCard>
  );
}

/** Opened from the reset email: Supabase signs the user in from the link, then they pick a new password. */
export function ResetPasswordScreen() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const { busy, error, run } = useSubmit();

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => navigate('/today', { replace: true }), 1500);
    return () => clearTimeout(t);
  }, [done, navigate]);

  if (loading) return <AuthCard title={s.resetTitle}>{strings.common.loading}</AuthCard>;
  if (!session) {
    return (
      <AuthCard title={s.resetTitle}>
        <Message kind="error">{s.resetInvalid}</Message>
        <p className="mt-6 text-sm">
          <Link to="/forgot-password" className="text-accent">
            {s.sendReset}
          </Link>
        </p>
      </AuthCard>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (password.length < MIN_PASSWORD) throw new Error(s.passwordTooShort);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
    });
  };

  return (
    <AuthCard title={s.setPassword}>
      {done ? (
        <Message kind="success">{s.passwordUpdated}</Message>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field
            label={s.newPassword}
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD}
            hint={s.passwordHint}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <Message kind="error">{error}</Message>}
          <Button type="submit" disabled={busy} className="w-full">
            {s.setPassword}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}

/** Wraps the signed-in part of the app. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading, otherAccountPending } = useAuth();
  if (loading) return <div className="p-6 text-slate-400">{strings.common.loading}</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (otherAccountPending > 0) {
    return (
      <AuthCard title={strings.appName}>
        <Message kind="error">{s.otherAccountPending(otherAccountPending)}</Message>
        <Button variant="secondary" className="mt-6 w-full" onClick={() => void supabase.auth.signOut({ scope: 'local' })}>
          {s.logOutThisAccount}
        </Button>
      </AuthCard>
    );
  }
  return <>{children}</>;
}

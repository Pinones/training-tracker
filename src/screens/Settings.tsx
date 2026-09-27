import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useAuth, useUserId } from '../auth/AuthProvider';
import { useProfile } from '../auth/useProfile';
import { backupFileName, exportBackup, importBackup } from '../backup/backup';
import { Screen } from '../components/Layout';
import { Button, Card, Field, Message, SectionTitle } from '../components/ui';
import { db } from '../db/db';
import type { ProfileRow } from '../db/types';
import { updateRow } from '../db/write';
import { todayIn } from '../logic/dates';
import { parseDecimal } from '../logic/format';
import { isStandalone } from '../lib/platform';
import { supabase } from '../lib/supabase';
import { useLiveQuery } from '../lib/useLiveQuery';
import { syncNow, useSyncStatus } from '../sync/controller';
import { strings } from '../strings';

const s = strings.settings;

export function Settings() {
  const profile = useProfile();
  return (
    <Screen title={s.title}>
      <SyncSection />
      {profile && <ProfileSection profile={profile} />}
      <BackupSection timezone={profile?.timezone} />
      <AccountSection />
      <AppSection />
    </Screen>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="text-slate-300">{label}</span>
      <span className="text-right text-slate-400">{children}</span>
    </div>
  );
}

function formatTimestamp(iso: string): string {
  // 24-hour, YYYY-MM-DD HH:MM in the device's timezone.
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------- Sync ----------

function SyncSection() {
  const pending = useLiveQuery(() => db.outbox.count());
  const { lastSyncAt, lastError, running, online } = useSyncStatus();
  return (
    <section id="sync">
      <SectionTitle>{s.syncSection}</SectionTitle>
      <Card className="divide-y divide-slate-800">
        <Row label={s.status}>
          {pending === undefined ? '…' : pending === 0 ? strings.sync.allSaved : strings.sync.waiting(pending)}
        </Row>
        <Row label={s.lastSynced}>{lastSyncAt ? formatTimestamp(lastSyncAt) : s.never}</Row>
        {!online && <Row label={strings.sync.offline}>{strings.common.offlineNeeded}</Row>}
        {lastError && (
          <div className="px-4 py-3">
            <Message kind="error">
              {s.lastError}: {lastError}
            </Message>
          </div>
        )}
        <div className="px-4 py-3">
          <Button variant="secondary" disabled={running || !online} onClick={() => void syncNow()}>
            {running ? strings.sync.syncing : s.syncNow}
          </Button>
        </div>
      </Card>
    </section>
  );
}

// ---------- Profile (every change saves immediately) ----------

function timezones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['Europe/Stockholm'];
  }
}

function ProfileSection({ profile }: { profile: ProfileRow }) {
  const [name, setName] = useState(profile.display_name);
  const [goal, setGoal] = useState(profile.bw_goal_kg?.toString() ?? '');
  const [goalError, setGoalError] = useState(false);
  const save = (changes: Partial<ProfileRow>) => void updateRow(db, 'profiles', profile.id, changes);

  useEffect(() => setName(profile.display_name), [profile.display_name]);
  useEffect(() => setGoal(profile.bw_goal_kg?.toString() ?? ''), [profile.bw_goal_kg]);

  const commitGoal = () => {
    if (goal.trim() === '') {
      setGoalError(false);
      if (profile.bw_goal_kg !== null) save({ bw_goal_kg: null });
      return;
    }
    const kg = parseDecimal(goal);
    setGoalError(kg === null || kg <= 0 || kg >= 1000);
    if (kg !== null && kg > 0 && kg < 1000 && kg !== profile.bw_goal_kg) save({ bw_goal_kg: kg });
  };

  const zones = timezones();
  return (
    <section>
      <SectionTitle>{s.profileSection}</SectionTitle>
      <Card className="space-y-4 p-4">
        <Field
          label={s.displayName}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() !== profile.display_name && save({ display_name: name.trim() })}
        />
        <label className="block">
          <span className="mb-1 block text-sm text-slate-300">{s.timezone}</span>
          <select
            className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-base"
            value={profile.timezone}
            onChange={(e) => save({ timezone: e.target.value })}
          >
            {(zones.includes(profile.timezone) ? zones : [profile.timezone, ...zones]).map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center justify-between">
          <span className="text-slate-300">{s.trackBodyweight}</span>
          <input
            type="checkbox"
            className="h-6 w-6 accent-emerald-400"
            checked={profile.track_bodyweight}
            onChange={(e) => save({ track_bodyweight: e.target.checked })}
          />
        </label>
        {profile.track_bodyweight && (
          <Field
            label={s.goalKg}
            inputMode="decimal"
            placeholder={s.goalNone}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onBlur={commitGoal}
            hint={goalError ? strings.body.invalidWeight : undefined}
          />
        )}
      </Card>
    </section>
  );
}

// ---------- Backup ----------

async function deliverFile(name: string, json: string) {
  const file = new File([json], name, { type: 'application/json' });
  // On iPhone the share sheet ("Save to Files") is the reliable way out of a Home Screen app.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function BackupSection({ timezone }: { timezone: string | undefined }) {
  const userId = useUserId();
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const download = async () => {
    const backup = await exportBackup(db, userId);
    await deliverFile(backupFileName(todayIn(timezone)), JSON.stringify(backup, null, 2));
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const { imported, skipped } = await importBackup(db, userId, JSON.parse(await file.text()));
      setMessage({ kind: 'success', text: s.imported(imported, skipped) });
    } catch (e) {
      setMessage({ kind: 'error', text: s.importFailed(e instanceof SyntaxError ? 'not a JSON file' : (e as Error).message) });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <section>
      <SectionTitle>{s.backupSection}</SectionTitle>
      <Card className="space-y-3 p-4">
        <Button variant="secondary" className="w-full" onClick={() => void download()}>
          {s.download}
        </Button>
        <Button variant="secondary" className="w-full" disabled={busy} onClick={() => input.current?.click()}>
          {s.import}
        </Button>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className="hidden"
          data-testid="import-input"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        {message && <Message kind={message.kind}>{message.text}</Message>}
      </Card>
    </section>
  );
}

// ---------- Account ----------

function AccountSection() {
  const { session, logOut } = useAuth();
  const [blocked, setBlocked] = useState(0);
  const [busy, setBusy] = useState(false);

  const onLogOut = async () => {
    setBusy(true);
    try {
      setBlocked(await logOut());
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <SectionTitle>{s.accountSection}</SectionTitle>
      <Card className="space-y-4 p-4">
        <p className="text-sm text-slate-400">
          {s.signedInAs} <span className="text-slate-200">{session?.user.email}</span>
        </p>
        <ChangePassword />
        <Button variant="secondary" className="w-full" disabled={busy} onClick={() => void onLogOut()}>
          {s.logOut}
        </Button>
        {blocked > 0 && <Message kind="error">{s.logOutBlocked(blocked)}</Message>}
        <DeleteAccount />
      </Card>
    </section>
  );
}

function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setMsg({ kind: 'error', text: strings.auth.passwordTooShort });
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return setMsg({ kind: 'error', text: error.message });
    setPassword('');
    setOpen(false);
    setMsg({ kind: 'success', text: strings.auth.passwordUpdated });
  };

  return (
    <div>
      {open ? (
        <form onSubmit={(e) => void submit(e)} className="space-y-3">
          <Field
            label={strings.auth.newPassword}
            type="password"
            autoComplete="new-password"
            minLength={8}
            hint={strings.auth.passwordHint}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="flex gap-2">
            <Button type="submit">{s.changePassword}</Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {strings.common.cancel}
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="secondary" className="w-full" onClick={() => setOpen(true)}>
          {s.changePassword}
        </Button>
      )}
      {msg && <div className="mt-2"><Message kind={msg.kind}>{msg.text}</Message></div>}
    </div>
  );
}

function DeleteAccount() {
  const { deleteAccount } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!navigator.onLine) return setError(strings.common.offlineNeeded);
    setBusy(true);
    try {
      await deleteAccount();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className="min-h-11 w-full text-sm text-red-400" onClick={() => setOpen(true)}>
        {s.deleteAccount}
      </button>
    );
  }
  return (
    <div className="space-y-3 rounded-xl border border-red-900 p-3">
      <Message kind="error">{s.deleteWarning}</Message>
      <Field label={s.deleteConfirmLabel} autoCapitalize="characters" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      {error && <Message kind="error">{error}</Message>}
      <div className="flex gap-2">
        <Button variant="danger" disabled={busy || confirm !== s.deleteConfirmWord} onClick={() => void run()}>
          {s.deleteForever}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          {strings.common.cancel}
        </Button>
      </div>
    </div>
  );
}

// ---------- App info ----------

function AppSection() {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(null));
  }, []);
  const yesNo = (v: boolean | null) => (v === null ? s.unknown : v ? s.yes : s.no);
  return (
    <section>
      <SectionTitle>{s.appInfo}</SectionTitle>
      <Card className="divide-y divide-slate-800">
        <Row label={s.version}>{__APP_VERSION__}</Row>
        <Row label={s.installed}>{yesNo(isStandalone())}</Row>
        <Row label={s.persistentStorage}>{yesNo(persisted)}</Row>
      </Card>
    </section>
  );
}

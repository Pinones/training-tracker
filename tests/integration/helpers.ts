import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. See .env.example (service role key goes in .env.test.local).`);
  return v;
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

export function adminClient(): SupabaseClient {
  return createClient(env('VITE_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), noSession);
}

export function anonClient(): SupabaseClient {
  return createClient(env('VITE_SUPABASE_URL'), env('VITE_SUPABASE_ANON_KEY'), noSession);
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient;
}

/** Create a confirmed throwaway user and a client signed in as them. */
export async function createTestUser(admin: SupabaseClient, label: string): Promise<TestUser> {
  const email = `test-${label}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const password = `pw-${crypto.randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error('createUser failed');
  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, email, password, client };
}

export async function deleteTestUser(admin: SupabaseClient, user: TestUser | undefined) {
  if (user) await admin.auth.admin.deleteUser(user.id);
}

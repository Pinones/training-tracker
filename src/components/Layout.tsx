import { Outlet } from 'react-router';
import { useProfile } from '../auth/useProfile';
import { SyncIndicator } from './SyncIndicator';
import { TabBar } from './TabBar';
import { UpdateBanner } from './UpdateBanner';

export function Layout() {
  const profile = useProfile();
  // Show Body until the profile has loaded, so the tab bar doesn't jump.
  const showBody = profile?.track_bodyweight ?? true;
  return (
    <div className="flex h-full flex-col">
      <main className="flex-1 overflow-y-auto pt-safe px-safe">
        <Outlet />
      </main>
      <UpdateBanner />
      <TabBar showBody={showBody} />
    </div>
  );
}

export function Screen({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-xl px-4 pb-6 pt-4">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{title}</h1>
        <SyncIndicator />
      </header>
      {children}
    </section>
  );
}

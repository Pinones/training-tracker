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

export function Screen({ title, children, small }: { title: string; children: React.ReactNode; small?: boolean }) {
  return (
    <section className="mx-auto max-w-xl px-4 pb-6 pt-4">
      {/* Wraps instead of overflowing when a long title meets a long sync message. */}
      <header className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h1 className={`min-w-0 break-words font-bold leading-tight ${small ? 'text-xl' : 'text-2xl'}`}>{title}</h1>
        <div className="ml-auto max-w-full">
          <SyncIndicator />
        </div>
      </header>
      {children}
    </section>
  );
}

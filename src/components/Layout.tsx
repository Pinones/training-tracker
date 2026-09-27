import { Outlet } from 'react-router';
import { TabBar } from './TabBar';
import { UpdateBanner } from './UpdateBanner';

export function Layout() {
  // Body tab visibility comes from the profile (track_bodyweight) once accounts exist in phase 2.
  const showBody = true;
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
      <h1 className="mb-4 text-2xl font-bold">{title}</h1>
      {children}
    </section>
  );
}

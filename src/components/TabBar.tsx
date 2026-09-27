import { NavLink } from 'react-router';
import type { ReactNode } from 'react';
import { strings } from '../strings';

const icon = (d: string): ReactNode => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const TABS = [
  { to: '/today', label: strings.tabs.today, icon: icon('M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z') },
  { to: '/history', label: strings.tabs.history, icon: icon('M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 3') },
  { to: '/progress', label: strings.tabs.progress, icon: icon('M3 3v18h18M7 15l4-4 3 3 5-6') },
  { to: '/body', label: strings.tabs.body, icon: icon('M4 20h16M6 20V9a6 6 0 0 1 12 0v11M12 9v4') },
  { to: '/settings', label: strings.tabs.settings, icon: icon('M4 6h16M4 12h16M4 18h16M8 4v4M16 10v4M10 16v4') },
];

export function TabBar({ showBody }: { showBody: boolean }) {
  const tabs = showBody ? TABS : TABS.filter((t) => t.to !== '/body');
  return (
    <nav className="border-t border-slate-800 bg-slate-900/95 pb-safe px-safe backdrop-blur" aria-label="Main">
      <ul className="flex">
        {tabs.map((t) => (
          <li key={t.to} className="flex-1">
            <NavLink
              to={t.to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-accent' : 'text-slate-400'}`
              }
            >
              {t.icon}
              {t.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

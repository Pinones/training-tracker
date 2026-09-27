// All user-facing text lives here so a translation can be added later.

export const strings = {
  appName: 'Training Tracker',

  tabs: {
    today: 'Today',
    history: 'History',
    progress: 'Progress',
    body: 'Body',
    settings: 'Settings',
  },

  placeholder: {
    comingInPhase: (phase: number) => `Coming in phase ${phase}.`,
  },

  today: {
    title: 'Today',
    empty: 'No active plan yet. You will be able to pick a template or build your own plan here.',
  },
  history: {
    title: 'History',
    empty: 'Your logged sessions will appear here, newest first.',
  },
  progress: {
    title: 'Progress',
    empty: 'Charts of your lifts, runs and personal records will appear here.',
  },
  body: {
    title: 'Body',
    empty: 'Log your bodyweight and see your weekly average here.',
  },
  settings: {
    title: 'Settings',
    appInfo: 'App',
    version: 'Version',
    installed: 'Opened from Home Screen',
    persistentStorage: 'Persistent storage',
    yes: 'Yes',
    no: 'No',
    unknown: 'Unknown',
  },

  update: {
    available: 'A new version is available.',
    reload: 'Reload',
    offlineReady: 'Ready to work offline.',
    dismiss: 'Dismiss',
  },

  notFound: 'Page not found.',
} as const;

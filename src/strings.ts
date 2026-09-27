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

  common: {
    loading: 'Loading…',
    cancel: 'Cancel',
    kg: 'kg',
    offlineNeeded: 'You need to be online for this.',
  },

  sync: {
    allSaved: 'All saved ✓',
    waiting: (n: number) => `${n} ${n === 1 ? 'change' : 'changes'} waiting to sync`,
    syncing: 'Syncing…',
    offline: 'Offline',
  },

  auth: {
    email: 'Email',
    password: 'Password',
    newPassword: 'New password',
    displayName: 'Your name',
    logIn: 'Log in',
    signUp: 'Create account',
    forgot: 'Forgot password?',
    noAccount: 'No account yet?',
    haveAccount: 'Already have an account?',
    backToLogin: 'Back to log in',
    sendReset: 'Send reset link',
    resetSent: 'If an account exists for that email, a reset link is on its way.',
    setPassword: 'Set new password',
    passwordUpdated: 'Password updated.',
    checkEmail: 'Check your email to confirm your account, then log in.',
    resetTitle: 'Reset password',
    resetInvalid: 'This reset link is invalid or has expired. Request a new one.',
    passwordHint: 'At least 8 characters.',
    passwordTooShort: 'Password must be at least 8 characters.',
    otherAccountPending: (n: number) =>
      `This device still has ${n} unsynced ${n === 1 ? 'change' : 'changes'} from another account. Log in with that account and let it sync before switching.`,
    logOutThisAccount: 'Log out of this account',
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
    todayWeight: "Today's weight",
    date: 'Date',
    log: 'Log',
    logged: (kg: string) => `Logged ${kg}`,
    invalidWeight: 'Enter a weight in kg, for example 82.4',
    chartTitle: 'Bodyweight',
    daily: 'Daily',
    weeklyAvg: 'Weekly average',
    goal: 'Goal',
    recent: 'Recent entries',
    delete: 'Delete',
    noEntries: 'No weigh-ins yet. Log your first one above.',
    plateau:
      'Your weekly average hasn’t dropped in 2 weeks. A small calorie reduction (about 100–200 kcal a day) may get things moving again.',
    trackingOff: 'Bodyweight tracking is turned off. Turn it on in Settings.',
  },
  settings: {
    title: 'Settings',

    syncSection: 'Sync',
    status: 'Status',
    lastSynced: 'Last synced',
    never: 'Not yet this session',
    lastError: 'Last error',
    syncNow: 'Sync now',

    profileSection: 'Profile',
    displayName: 'Name',
    timezone: 'Timezone',
    trackBodyweight: 'Track bodyweight',
    goalKg: 'Goal weight (kg)',
    goalNone: 'None',

    backupSection: 'Backup',
    download: 'Download my data (JSON)',
    import: 'Import from backup',
    imported: (n: number, skipped: number) =>
      `Imported ${n} ${n === 1 ? 'item' : 'items'}${skipped ? `, ${skipped} already up to date` : ''}.`,
    importFailed: (msg: string) => `Import failed: ${msg}`,

    accountSection: 'Account',
    signedInAs: 'Signed in as',
    changePassword: 'Change password',
    logOut: 'Log out',
    logOutBlocked: (n: number) =>
      `${n} ${n === 1 ? 'change hasn’t' : 'changes haven’t'} synced yet. Connect to the internet and wait for "All saved ✓" before logging out, or they will be lost.`,
    deleteAccount: 'Delete account',
    deleteWarning:
      'This permanently deletes your account and all your plans, workouts and weigh-ins. Download a backup first if you want to keep them. This cannot be undone.',
    deleteConfirmLabel: 'Type DELETE to confirm',
    deleteConfirmWord: 'DELETE',
    deleteForever: 'Delete my account',

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

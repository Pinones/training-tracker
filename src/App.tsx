import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router';
import { AuthProvider } from './auth/AuthProvider';
import {
  ForgotPasswordScreen,
  LoginScreen,
  RequireAuth,
  ResetPasswordScreen,
  SignupScreen,
} from './auth/AuthScreens';
import { Layout, Screen } from './components/Layout';
import { Placeholder } from './screens/Placeholder';
import { Settings } from './screens/Settings';
import { Today } from './screens/Today';
import { strings } from './strings';

const router = createBrowserRouter([
  {
    element: (
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    ),
    children: [
      { path: 'login', element: <LoginScreen /> },
      { path: 'signup', element: <SignupScreen /> },
      { path: 'forgot-password', element: <ForgotPasswordScreen /> },
      { path: 'reset-password', element: <ResetPasswordScreen /> },
      {
        element: (
          <RequireAuth>
            <Layout />
          </RequireAuth>
        ),
        children: [
          { index: true, element: <Navigate to="/today" replace /> },
          { path: 'today', element: <Today /> },
          { path: 'plans', lazy: async () => ({ Component: (await import('./plans/PlansScreen')).PlansScreen }) },
          { path: 'plans/new', lazy: async () => ({ Component: (await import('./plans/PlansScreen')).NewPlanScreen }) },
          { path: 'plans/:id/edit', lazy: async () => ({ Component: (await import('./plans/PlanWizard')).PlanWizard }) },
          { path: 'history', element: <Placeholder title={strings.history.title} text={strings.history.empty} phase={5} /> },
          { path: 'progress', element: <Placeholder title={strings.progress.title} text={strings.progress.empty} phase={5} /> },
          { path: 'body', lazy: async () => ({ Component: (await import('./screens/Body')).Body }) }, // charts load on demand
          { path: 'settings', element: <Settings /> },
          { path: '*', element: <Screen title={strings.notFound}>{null}</Screen> },
        ],
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}

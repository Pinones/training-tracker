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
import { Body } from './screens/Body';
import { Placeholder } from './screens/Placeholder';
import { Settings } from './screens/Settings';
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
          { path: 'today', element: <Placeholder title={strings.today.title} text={strings.today.empty} phase={4} /> },
          { path: 'history', element: <Placeholder title={strings.history.title} text={strings.history.empty} phase={5} /> },
          { path: 'progress', element: <Placeholder title={strings.progress.title} text={strings.progress.empty} phase={5} /> },
          { path: 'body', element: <Body /> },
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

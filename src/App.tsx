import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { Layout, Screen } from './components/Layout';
import { Placeholder } from './screens/Placeholder';
import { Settings } from './screens/Settings';
import { strings } from './strings';

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/today" replace /> },
      { path: 'today', element: <Placeholder title={strings.today.title} text={strings.today.empty} phase={4} /> },
      { path: 'history', element: <Placeholder title={strings.history.title} text={strings.history.empty} phase={5} /> },
      { path: 'progress', element: <Placeholder title={strings.progress.title} text={strings.progress.empty} phase={5} /> },
      { path: 'body', element: <Placeholder title={strings.body.title} text={strings.body.empty} phase={2} /> },
      { path: 'settings', element: <Settings /> },
      { path: '*', element: <Screen title={strings.notFound}>{null}</Screen> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}

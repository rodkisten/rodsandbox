import React from 'react';
import { createRootRoute, createRoute, createRouter, Outlet, Link } from '@tanstack/react-router';
import Playground from '@/components/layout/Playground';

const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: () => <main className="p-6"><h1>Page not found</h1><Link to="/">Open sandbox</Link></main>,
});
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <Playground workspaceId="default-workspace" />,
});
const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/w/$workspaceId',
  component: WorkspacePage,
});
function WorkspacePage() {
  const { workspaceId } = workspaceRoute.useParams();
  if (!/^[a-zA-Z0-9_-]+$/.test(workspaceId)) return <Link to="/">Invalid workspace. Return home.</Link>;
  return <Playground key={workspaceId} workspaceId={workspaceId} />;
}
export const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute, workspaceRoute]) });
declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}

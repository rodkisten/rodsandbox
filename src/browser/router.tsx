import React from 'react';
import { createRootRoute, createRoute, createRouter, Outlet, Link } from '@tanstack/react-router';
import LocalWorkspaces from './LocalWorkspaces';
import { isSandboxWorkspaceId } from './SandboxApp';
import StandaloneSandbox from './StandaloneSandbox';

const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: () => <main className="p-6"><h1>Page not found</h1><Link to="/">Open sandbox</Link></main>,
});
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <StandaloneSandbox workspaceId="default-workspace" />,
});
const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/w/$workspaceId',
  component: WorkspacePage,
});
const workspacesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workspaces',
  component: LocalWorkspaces,
});
function WorkspacePage() {
  const { workspaceId } = workspaceRoute.useParams();
  if (!isSandboxWorkspaceId(workspaceId)) return <Link to="/">Invalid workspace. Return home.</Link>;
  return <StandaloneSandbox workspaceId={workspaceId} />;
}
export const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute, workspaceRoute, workspacesRoute]) });
declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}

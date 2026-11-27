import React from 'react';
import Playground from '@/components/layout/Playground';

/** Feature entry shared by standalone routing and the future federation expose.
 * No root creation, global styles, router registration or document listeners.
 * The host owns navigation and must supply an authorized workspace identity.
 */
export interface SandboxAppProps {
  workspaceId: string;
}

export function isSandboxWorkspaceId(value: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(value);
}

export default function SandboxApp({ workspaceId }: SandboxAppProps) {
  if (!isSandboxWorkspaceId(workspaceId)) {
    return <div role="alert">Invalid sandbox workspace.</div>;
  }
  return <Playground key={workspaceId} workspaceId={workspaceId} />;
}

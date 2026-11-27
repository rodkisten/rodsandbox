import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import type { RodModuleContext } from "@rodverse/module-sdk";
import SandboxApp from "./SandboxApp";

/** Standalone owns its router and supplies the same public contract as Manage. */
export default function StandaloneSandbox({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [context, setContext] = useState<RodModuleContext | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const events = new EventTarget();
    setContext({
      contractMajor: 1,
      host: { name: "RodSandbox", version: "0.1.0", mode: "standalone" },
      workspace: { id: workspaceId },
      identity: null,
      location: { pathname: location.pathname, search: location.searchStr },
      navigate: (path) => {
        if (!/^\/(?:workspaces|w\/[a-zA-Z0-9_-]+)?$/.test(path))
          throw new Error("Invalid sandbox route");
        void navigate({ to: path });
      },
      theme: { mode: "dark", tokens: {} },
      notify: (notification) => console.info(notification.title),
      events: {
        publish: (type, payload) =>
          events.dispatchEvent(new CustomEvent(type, { detail: payload })),
        subscribe: (type, listener) => {
          const handler = (event: Event) =>
            listener((event as CustomEvent).detail);
          events.addEventListener(type, handler, { signal: controller.signal });
          return () => events.removeEventListener(type, handler);
        },
      },
      api: {},
      capabilities: ["browser.filesystem", "browser.build", "browser.terminal"],
      flags: {},
      lifecycle: { ready() {}, dispose() {} },
      signal: controller.signal,
    });
    return () => controller.abort();
  }, [workspaceId, location.pathname, location.searchStr, navigate]);
  return context && !context.signal.aborted ? (
    <SandboxApp workspaceId={workspaceId} context={context} />
  ) : null;
}

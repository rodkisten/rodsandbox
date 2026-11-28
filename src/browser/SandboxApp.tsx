import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import {
  assertModuleContext,
  type RodModuleContext,
} from "@rodverse/module-sdk";
import { standaloneRuntimeClient, type RuntimeClient } from "@/runtime/client";
import Playground from "@/components/layout/Playground";
import { SandboxRuntime } from "./RuntimeContext";
import { createPersistence } from "@/persistence/db";
import css from "../app/globals.css?inline";

export interface SandboxAppProps {
  workspaceId: string;
  embedded?: boolean;
  context?: RodModuleContext;
}
export function isSandboxWorkspaceId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(value);
}

/** One feature tree for standalone and federation; never creates a React root/router. */
export default function SandboxApp({
  workspaceId,
  embedded = false,
  context,
}: SandboxAppProps) {
  const boundary = useRef<HTMLDivElement>(null);
  const [mount, setMount] = useState<{
    root: ShadowRoot;
    content: HTMLElement;
    portals: HTMLElement;
  } | null>(null);
  const aborted = useSyncExternalStore(
    (notify) => {
      context?.signal.addEventListener("abort", notify, { once: true });
      return () => context?.signal.removeEventListener("abort", notify);
    },
    () => context?.signal.aborted ?? false,
    () => false,
  );
  if (context) assertModuleContext(context);
  const scope = embedded
    ? `manage:${context?.identity?.id ?? "anonymous"}:${workspaceId}`
    : "";
  const persistence = useMemo(() => createPersistence(scope), [scope]);
  useLayoutEffect(() => {
    const element = boundary.current;
    if (!embedded || !element) return;
    const root = element.shadowRoot ?? element.attachShadow({ mode: "open" });
    const content = document.createElement("div");
    content.style.cssText = "height:100%;min-height:0;";
    const portals = document.createElement("div");
    portals.dataset.sandboxPortals = "";
    root.append(content, portals);
    setMount({ root, content, portals });
    return () => {
      content.remove();
      portals.remove();
    };
  }, [embedded]);
  useEffect(() => {
    if (!context) return;
    context.lifecycle.ready();
    return () => {
      context.lifecycle.dispose();
    };
  }, [context]);
  const activePersistence = useRef<{
    persistence: ReturnType<typeof createPersistence>;
    token: object;
  } | null>(null);
  useEffect(() => {
    const token = {};
    activePersistence.current = { persistence, token };
    return () => {
      queueMicrotask(() => {
        if (
          activePersistence.current?.token === token ||
          activePersistence.current?.persistence !== persistence
        )
          void persistence.close();
      });
    };
  }, [persistence]);
  const runtime = useMemo(
    () => ({
      persistence,
      remoteRuntime: embedded
        ? context?.api["sandbox.runtime"]
          ? (((path, init = {}) =>
              context.api["sandbox.runtime"]!(
                { path, method: init.method ?? "GET", body: init.body },
                init.signal ?? context.signal,
              )) as RuntimeClient)
          : null
        : standaloneRuntimeClient,
      storageScope: scope,
      embedded,
      theme: embedded ? context?.theme.mode : undefined,
      portalContainer:
        context?.portalContainer &&
        context.portalContainer.getRootNode() === mount?.root
          ? context.portalContainer
          : mount?.portals,
    }),
    [persistence, scope, embedded, context, mount],
  );
  if (!isSandboxWorkspaceId(workspaceId))
    return <div role="alert">Invalid sandbox workspace.</div>;
  const feature = (
    <SandboxRuntime.Provider value={runtime}>
      {embedded && (
        <style>
          {css.replaceAll(":root", ":host") +
            "\n:host { display:block; color-scheme:dark; --safe-top:0px; --safe-bottom:0px; } .sandbox-workbench { height:100% !important; } input,select,textarea {font-size:16px !important;} @media(pointer:coarse) { .cm-editor .cm-content,.cm-editor .cm-gutters {font-size:max(16px,var(--editor-font-size,16px)) !important;} }"}
        </style>
      )}
      {!aborted && (
        <Playground
          key={workspaceId}
          workspaceId={workspaceId}
          embedded={embedded}
        />
      )}
    </SandboxRuntime.Provider>
  );
  if (!embedded) return feature;
  return (
    <div
      ref={boundary}
      data-rod-module="sandbox"
      style={{
        height: "100%",
        minHeight: 0,
        position: "relative",
        contain: "layout paint style",
        ...context?.theme.tokens,
      }}
    >
      {mount && createPortal(feature, mount.content)}
    </div>
  );
}

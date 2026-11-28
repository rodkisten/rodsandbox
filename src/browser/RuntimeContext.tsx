import { createContext, useContext } from "react";
import { standaloneRuntimeClient, type RuntimeClient } from "@/runtime/client";
import { createPersistence } from "@/persistence/db";
export const SandboxRuntime = createContext({
  remoteRuntime: standaloneRuntimeClient as RuntimeClient | null,
  persistence: createPersistence(),
  storageScope: "",
  portalContainer: undefined as HTMLElement | undefined,
  embedded: false,
  theme: undefined as "light" | "dark" | undefined,
});
export const useSandboxRuntime = () => useContext(SandboxRuntime);

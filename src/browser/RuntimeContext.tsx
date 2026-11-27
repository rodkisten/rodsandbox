import { createContext, useContext } from "react";
import { createPersistence } from "@/persistence/db";
export const SandboxRuntime = createContext({
  persistence: createPersistence(),
  storageScope: "",
  portalContainer: undefined as HTMLElement | undefined,
  embedded: false,
  theme: undefined as "light" | "dark" | undefined,
});
export const useSandboxRuntime = () => useContext(SandboxRuntime);

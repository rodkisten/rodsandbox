import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { federation } from "@module-federation/vite";
export default defineConfig(({ mode }) => {
  const remote = mode === "federation";
  const sha =
    process.env.MODULE_SHA ||
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const origin = process.env.MODULE_ORIGIN || "https://sandbox.migos.club";
  return {
    base: remote ? `${origin}/modules/sandbox/${sha}/` : "/",
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    plugins: remote
      ? [
          federation({
            name: "rod_sandbox",
            filename: "remoteEntry.js",
            manifest: true,
            exposes: { "./App": "./src/browser/remote.tsx" },
            shared: {
              react: {
                singleton: true,
                requiredVersion: "^19.2.4",
                strictVersion: true,
              },
              "react-dom": {
                singleton: true,
                requiredVersion: "^19.2.4",
                strictVersion: true,
              },
            },
            dts: false,
          }),
        ]
      : [],
    worker: { format: "es" },
    build: { target: "es2022", outDir: remote ? "dist-module" : "dist" },
  };
});

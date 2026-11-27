import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const sha =
  process.env.MODULE_SHA ||
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("Invalid module SHA");
const origin = process.env.MODULE_ORIGIN || "https://sandbox.migos.club";
const path = `/modules/sandbox/${sha}/`;
mkdirSync(`dist${path}`, { recursive: true });
cpSync("dist-module", `dist${path}`, { recursive: true });
const manifest = {
  schemaVersion: 1,
  id: "sandbox",
  name: "rod_sandbox",
  version: "0.1.0",
  gitSha: sha,
  contractMajor: 1,
  entry: origin + path + "mf-manifest.json",
  standaloneUrl: origin,
  exposes: ["./App"],
  capabilities: ["browser.filesystem", "browser.build", "browser.terminal"],
};
writeFileSync(`dist${path}rod-module.json`, JSON.stringify(manifest, null, 2));
writeFileSync("dist/rod-module.json", JSON.stringify(manifest, null, 2));
writeFileSync(
  "dist/_headers",
  `/modules/*\n  Access-Control-Allow-Origin: *\n  Cache-Control: public, max-age=31536000, immutable\n  X-Content-Type-Options: nosniff\n/rod-module.json\n  Cache-Control: no-store\n  Access-Control-Allow-Origin: *\n`,
);

// ==UserScript==
// @name         Rod CDN / Shiki IIFE smoke test
// @namespace    https://code.migos.club/userscripts
// @version      2026.06.03
// @description  Loads Shiki through the Rod CDN esbuild pipeline.
// @match        *://*/*
// @run-at       document-idle
// @grant        none
// @require      https://code.migos.club/api/cdn?pkg=shiki@4.2.0&entry=shiki/bundle/web&bundle=iife&global=Shiki&cache=immutable&minify=true
// ==/UserScript==

(function main() {
  "use strict";

  console.log("Shiki global:", globalThis.Shiki);
})();

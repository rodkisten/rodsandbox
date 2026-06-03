// ==UserScript==
// @name         Rod CDN CSS Shadow Example
// @namespace    https://rod.dev/userscripts
// @version      1.0.0
// @description  Demonstrates CSS + JS from Rod CDN with manual ShadowRoot style injection.
// @author       Rod
// @match        *://*/*
// @run-at       document-idle
// @grant        none
// @require      https://code.migos.club/api/cdn?package=lodash(n:Utils)&css=highlight.js@11.11.1/styles/github-dark.min.css&bundle=raw&global=RodCDN&css-target=manual&css-id=rod-cdn-shadow-theme
// ==/UserScript==

(function rodCdnCssShadowExample() {
  "use strict";

  const host = document.createElement("section");
  const shadow = host.attachShadow({ mode: "open" });

  RodCDN.injectStyles(shadow);

  const code = document.createElement("pre");
  code.className = "hljs";
  code.textContent = `RodCDN.Utils is available: ${Boolean(RodCDN.Utils)}`;

  shadow.appendChild(code);
  document.documentElement.appendChild(host);
})();

import type { FileLanguage } from '@/types';

export interface WorkspaceTemplateFile {
  path: string;
  language: FileLanguage;
  content: string;
}

export interface WorkspaceTemplate {
  id: 'vanilla-ts' | 'html-css-js' | 'lit' | 'preact' | 'userscript' | 'bookmarklet';
  name: string;
  description: string;
  files: WorkspaceTemplateFile[];
}

export const WORKSPACE_TEMPLATES: WorkspaceTemplate[] = [
  {
    id: 'vanilla-ts',
    name: 'Vanilla TypeScript',
    description: 'TypeScript + DOM starter',
    files: [
      { path: 'index.html', language: 'html', content: '<!doctype html><html><body><div id="app"></div><script src="main.js"></script></body></html>' },
      { path: 'main.ts', language: 'typescript', content: 'const app = document.getElementById("app");\nif (app) app.textContent = "Vanilla TS template";\nconsole.log("ready");' },
      { path: 'styles.css', language: 'css', content: 'body{font-family:system-ui;padding:24px;}'}
    ],
  },
  {
    id: 'html-css-js', name: 'HTML/CSS/JS', description: 'No TypeScript, simple web page', files: [
      { path: 'index.html', language: 'html', content: '<!doctype html><html><body><h1 id="title">HTML/CSS/JS</h1><script src="main.js"></script></body></html>'},
      { path: 'main.js', language: 'javascript', content: 'console.log("hello from JS template");' },
      { path: 'styles.css', language: 'css', content: 'h1{color:#22c55e;}' }
    ]
  },
  {
    id: 'lit', name: 'Lit', description: 'Lit component starter', files: [
      { path: 'index.html', language: 'html', content: '<!doctype html><html><body><my-app></my-app><script src="main.js"></script></body></html>' },
      { path: 'main.ts', language: 'typescript', content: "import {LitElement, html, css} from 'lit';\nclass MyApp extends LitElement { static styles = css`:host{display:block;padding:16px}`; render(){return html`<h1>Lit template</h1>`;} }\ncustomElements.define('my-app', MyApp);" },
    ]
  },
  {
    id: 'preact', name: 'Preact', description: 'Preact render starter', files: [
      { path: 'index.html', language: 'html', content: '<!doctype html><html><body><div id="app"></div><script src="main.js"></script></body></html>' },
      { path: 'main.ts', language: 'typescript', content: "import { h, render } from 'preact';\nconst App = () => h('h1', null, 'Preact template');\nrender(h(App, {}), document.getElementById('app')!);" },
    ]
  },
  {
    id: 'userscript', name: 'Userscript', description: 'Tampermonkey/Greasemonkey starter', files: [
      { path: 'main.js', language: 'javascript', content: "// ==UserScript==\n// @name         RodSandbox Script\n// @match        *://*/*\n// ==/UserScript==\n(function(){'use strict';console.log('userscript loaded');})();" }
    ]
  },
  {
    id: 'bookmarklet', name: 'Bookmarklet', description: 'Bookmarklet starter', files: [
      { path: 'main.js', language: 'javascript', content: "javascript:(() => { alert('Hello from bookmarklet'); })();" }
    ]
  },
];

export function getTemplateById(id: WorkspaceTemplate['id']): WorkspaceTemplate | undefined {
  return WORKSPACE_TEMPLATES.find((template) => template.id === id);
}

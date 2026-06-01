import type { NextConfig } from 'next';

const CSP = [
  "default-src 'self'",
  // Needed for esbuild-wasm initialisation and React devtools
  "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' blob:",
  // Web Workers compiled to blob: URLs by Next.js / Turbopack
  "worker-src blob: 'self'",
  // Allow fetching esbuild-wasm from esm.sh and npm package search
  "connect-src 'self' https://esm.sh https://cdn.jsdelivr.net https://registry.npmjs.org https://api.github.com",
  // iframe sandbox for preview panel
  "child-src blob: 'self'",
  // iframe src="about:blank" used by xterm.js
  "frame-src blob: 'self'",
  // Styles may be injected inline by xterm.js / CodeMirror
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
].join('; ');

const nextConfig: NextConfig = {
  turbopack: {},
serverExternalPackages: ["esbuild", "node-pty"],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: CSP,
          },
        ],
      },
    ];
  },
};

export default nextConfig;

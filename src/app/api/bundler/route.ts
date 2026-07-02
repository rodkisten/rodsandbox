import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import JSZip from 'jszip';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const execFileAsync = promisify(execFile);

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const INSTALL_TIMEOUT_MS = 180_000;
const BUILD_TIMEOUT_MS = 90_000;

const ENTRY_CANDIDATES = [
  'index.ts',
  'index.tsx',
  'index.js',
  'index.jsx',
  'bundle.ts',
  'bundle.tsx',
  'bundle.js',
  'bundle.jsx',
  'main.ts',
  'main.tsx',
  'main.js',
  'main.jsx',
  'src/index.ts',
  'src/index.tsx',
  'src/index.js',
  'src/index.jsx',
  'src/bundle.ts',
  'src/bundle.tsx',
  'src/bundle.js',
  'src/bundle.jsx',
  'src/main.ts',
  'src/main.tsx',
  'src/main.js',
  'src/main.jsx',
  'index',
  'bundle',
  'main',
  'src/index',
  'src/bundle',
  'src/main',
];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

type BundleOptions = {
  format: 'iife' | 'esm' | 'cjs';
  globalName: string;
  minify: boolean;
  platform: 'browser' | 'node' | 'neutral';
  target: string;
  external: string[];
};

type UploadedProject = {
  rootDir: string;
  entryFile: string;
  originalName: string;
  singleFile: boolean;
};

function boolFromForm(value: FormDataEntryValue | null, fallback: boolean): boolean {
  if (value == null) return fallback;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(text)) return false;
  return fallback;
}

function optionsFromForm(form: FormData): BundleOptions {
  const rawFormat = String(form.get('format') ?? 'iife').toLowerCase();
  const format = rawFormat === 'esm' || rawFormat === 'cjs' ? rawFormat : 'iife';

  const rawPlatform = String(form.get('platform') ?? 'browser').toLowerCase();
  const platform = rawPlatform === 'node' || rawPlatform === 'neutral' ? rawPlatform : 'browser';

  return {
    format,
    globalName: sanitizeGlobalName(String(form.get('global') ?? form.get('globalName') ?? 'RodBundle')),
    minify: boolFromForm(form.get('minify'), false),
    platform,
    target: String(form.get('target') ?? 'es2020'),
    external: String(form.get('external') ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  };
}

function sanitizeGlobalName(value: string): string {
  const cleaned = value.trim().replace(/[^A-Za-z0-9_$.[\]]+/g, '');
  return cleaned || 'RodBundle';
}

function safeJoin(baseDir: string, unsafePath: string): string | null {
  const normalized = path.normalize(unsafePath).replace(/^([/\\])+/, '');
  if (!normalized || normalized.startsWith('..') || path.isAbsolute(normalized)) return null;
  const fullPath = path.join(baseDir, normalized);
  const relative = path.relative(baseDir, fullPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return fullPath;
}

async function commandExists(command: string): Promise<boolean> {
  const probe = process.platform === 'win32' ? 'where' : 'command';
  const args = process.platform === 'win32' ? [command] : ['-v', command];
  try {
    await execFileAsync(probe, args, { shell: process.platform !== 'win32', timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

async function run(command: string, args: string[], cwd: string, timeout: number): Promise<string> {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd,
    timeout,
    maxBuffer: 20 * 1024 * 1024,
    env: {
      ...process.env,
      CI: '1',
      npm_config_audit: 'false',
      npm_config_fund: 'false',
    },
  });
  return [stdout, stderr].filter(Boolean).join('\n').trim();
}

async function installDependencies(projectDir: string): Promise<string[]> {
  if (!existsSync(path.join(projectDir, 'package.json'))) return [];

  const logs: string[] = [];

  if (existsSync(path.join(projectDir, 'pnpm-lock.yaml'))) {
    if (await commandExists('corepack')) {
      await run('corepack', ['enable'], projectDir, 30_000).catch(() => '');
    }
    if (await commandExists('pnpm')) {
      logs.push(await run('pnpm', ['install', '--frozen-lockfile=false', '--prefer-offline'], projectDir, INSTALL_TIMEOUT_MS));
      return logs;
    }
  }

  if (existsSync(path.join(projectDir, 'yarn.lock')) && await commandExists('yarn')) {
    logs.push(await run('yarn', ['install', '--ignore-scripts=false'], projectDir, INSTALL_TIMEOUT_MS));
    return logs;
  }

  if (existsSync(path.join(projectDir, 'package-lock.json')) || existsSync(path.join(projectDir, 'npm-shrinkwrap.json'))) {
    logs.push(await run('npm', ['install', '--include=dev'], projectDir, INSTALL_TIMEOUT_MS));
    return logs;
  }

  logs.push(await run('npm', ['install', '--include=dev'], projectDir, INSTALL_TIMEOUT_MS));
  return logs;
}

async function readPackageEntry(projectDir: string): Promise<string | null> {
  const packagePath = path.join(projectDir, 'package.json');
  if (!existsSync(packagePath)) return null;

  try {
    const pkg = JSON.parse(await readFile(packagePath, 'utf8')) as Record<string, unknown>;
    const candidates = [pkg.source, pkg.module, pkg.browser, pkg.main, pkg.exports]
      .flatMap((value) => extractPackageEntryCandidates(value));

    for (const candidate of candidates) {
      const normalized = candidate.replace(/^\.\//, '');
      const fullPath = resolveSourceFile(path.join(projectDir, normalized));
      if (fullPath) return fullPath;
    }
  } catch {
    return null;
  }

  return null;
}

function extractPackageEntryCandidates(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(extractPackageEntryCandidates);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const priority = [record.source, record.import, record.default, record.browser, record.module, record.require];
    const rest = Object.values(record).filter((item) => !priority.includes(item));
    return [...priority, ...rest].flatMap(extractPackageEntryCandidates);
  }
  return [];
}

function resolveSourceFile(candidatePath: string): string | null {
  if (existsSync(candidatePath) && SOURCE_EXTENSIONS.has(path.extname(candidatePath))) return candidatePath;

  for (const extension of SOURCE_EXTENSIONS) {
    const withExtension = `${candidatePath}${extension}`;
    if (existsSync(withExtension)) return withExtension;
  }

  return null;
}

async function findEntry(projectDir: string): Promise<string | null> {
  const packageEntry = await readPackageEntry(projectDir);
  if (packageEntry) return packageEntry;

  for (const candidate of ENTRY_CANDIDATES) {
    const fullPath = resolveSourceFile(path.join(projectDir, candidate));
    if (fullPath) return fullPath;
  }

  return null;
}

async function findProjectRoot(extractedDir: string): Promise<string> {
  if (existsSync(path.join(extractedDir, 'package.json'))) return extractedDir;

  const children = await readdir(extractedDir, { withFileTypes: true });
  const dirs = children.filter((child) => child.isDirectory());
  if (dirs.length === 1) {
    const onlyDir = path.join(extractedDir, dirs[0].name);
    if (existsSync(path.join(onlyDir, 'package.json'))) return onlyDir;
    const nestedEntry = await findEntry(onlyDir);
    if (nestedEntry) return onlyDir;
  }

  return extractedDir;
}

async function materializeUpload(file: File, tempDir: string, explicitEntry: string | null): Promise<UploadedProject> {
  const originalName = file.name || 'upload';
  const bytes = Buffer.from(await file.arrayBuffer());

  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(`Upload too large. Limit: ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`);
  }

  const ext = path.extname(originalName).toLowerCase();
  const singleFile = ext !== '.zip';

  if (singleFile) {
    if (!SOURCE_EXTENSIONS.has(ext)) {
      throw new Error('Single-file uploads must be .ts, .tsx, .js, .jsx, .mjs, or .cjs.');
    }
    const projectDir = path.join(tempDir, 'single-file');
    await mkdir(projectDir, { recursive: true });
    const entryFile = path.join(projectDir, path.basename(originalName));
    await writeFile(entryFile, bytes);
    return { rootDir: projectDir, entryFile, originalName, singleFile };
  }

  const extractedDir = path.join(tempDir, 'project');
  await mkdir(extractedDir, { recursive: true });
  const zip = await JSZip.loadAsync(bytes);
  const writes: Promise<unknown>[] = [];

  zip.forEach((relativePath, entry) => {
    const targetPath = safeJoin(extractedDir, relativePath);
    if (!targetPath) return;

    if (entry.dir) {
      writes.push(mkdir(targetPath, { recursive: true }));
      return;
    }

    writes.push((async () => {
      await mkdir(path.dirname(targetPath), { recursive: true });
      const content = await entry.async('nodebuffer');
      await writeFile(targetPath, content);
    })());
  });

  await Promise.all(writes);

  const rootDir = await findProjectRoot(extractedDir);
  const explicitEntryPath = explicitEntry ? safeJoin(rootDir, explicitEntry) : null;
  if (explicitEntry && !explicitEntryPath) {
    throw new Error('Invalid explicit entry path.');
  }

  const explicitEntryFile = explicitEntryPath ? resolveSourceFile(explicitEntryPath) : null;
  if (explicitEntry && !explicitEntryFile) {
    throw new Error(`Explicit entry was not found or is not a supported source file: ${explicitEntry}`);
  }

  const entryFile = explicitEntryFile ?? await findEntry(rootDir);

  if (!entryFile) {
    throw new Error(`Could not find an entry point. Tried package.json source/module/browser/main plus: ${ENTRY_CANDIDATES.join(', ')}.`);
  }

  return { rootDir, entryFile, originalName, singleFile };
}

function makeBanner(project: UploadedProject, options: BundleOptions, installLogs: string[], warnings: readonly unknown[]): string {
  const builtAt = new Date();
  const localTime = builtAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false });
  const entryRelative = path.relative(project.rootDir, project.entryFile).replaceAll(path.sep, '/');
  const lines = [
    '/*',
    ' * 📦 RodSandbox Bundle',
    ` * Built at: ${localTime} America/Sao_Paulo`,
    ` * Source: ${project.originalName}`,
    ` * Entry: ${entryRelative || path.basename(project.entryFile)}`,
    ` * Format: ${options.format}`,
    ` * Platform: ${options.platform}`,
    ` * Target: ${options.target}`,
    ` * Minified: ${options.minify ? 'yes' : 'no'}`,
    ` * Dependencies: ${project.singleFile ? 'single-file upload, install skipped' : installLogs.length ? 'installed/resolved' : 'no package.json found'}`,
    warnings.length ? ` * Warnings: ${warnings.length}` : null,
    ' */',
    '',
  ].filter(Boolean);

  return lines.join('\n');
}

function makeDownloadName(originalName: string): string {
  const base = path.basename(originalName, path.extname(originalName)).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'bundle';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${base}-${stamp}.bundle.js`;
}

async function buildBundle(project: UploadedProject, options: BundleOptions, tempDir: string) {
  const esbuild = await import('esbuild');
  const outfile = path.join(tempDir, 'dist', 'bundle.js');
  await mkdir(path.dirname(outfile), { recursive: true });

  const result = await esbuild.build({
    entryPoints: [project.entryFile],
    outfile,
    bundle: true,
    format: options.format,
    globalName: options.format === 'iife' ? options.globalName : undefined,
    platform: options.platform,
    target: options.target,
    minify: options.minify,
    sourcemap: false,
    absWorkingDir: project.rootDir,
    external: options.external,
    logLevel: 'silent',
    metafile: true,
    write: true,
  });

  const code = await readFile(outfile, 'utf8');
  return { code, warnings: result.warnings, metafile: result.metafile };
}

function errorResponse(error: unknown, status = 500): Response {
  const message = error instanceof Error ? error.message : String(error);
  return Response.json({ ok: false, error: message }, { status });
}

export async function GET() {
  return Response.json({
    ok: true,
    endpoint: '/api/bundle',
    method: 'POST multipart/form-data',
    fields: {
      file: 'Required. A .zip project or a single .ts/.tsx/.js/.jsx/.mjs/.cjs file.',
      entry: 'Optional for zip uploads. Example: src/index.ts.',
      format: 'Optional. iife, esm, or cjs. Default: iife.',
      global: 'Optional IIFE global name. Default: RodBundle.',
      platform: 'Optional. browser, node, or neutral. Default: browser.',
      target: 'Optional. Default: es2020.',
      minify: 'Optional boolean. Default: false.',
      external: 'Optional comma-separated package names.',
    },
  });
}

export async function POST(req: NextRequest) {
  const tempDir = path.join(tmpdir(), `rodsandbox-bundle-${randomUUID()}`);

  try {
    await mkdir(tempDir, { recursive: true });

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return errorResponse(new Error('Missing multipart file field named "file".'), 400);
    }

    const explicitEntry = form.get('entry') ? String(form.get('entry')) : null;
    const options = optionsFromForm(form);
    const project = await materializeUpload(file, tempDir, explicitEntry);
    const installLogs = await installDependencies(project.rootDir);
    const build = await Promise.race([
      buildBundle(project, options, tempDir),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Build timed out.')), BUILD_TIMEOUT_MS)),
    ]);

    const banner = makeBanner(project, options, installLogs, build.warnings);
    const body = banner + build.code;
    const downloadName = makeDownloadName(project.originalName);

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Content-Disposition': `attachment; filename="${downloadName}"`,
        'Cache-Control': 'no-store',
        'X-RodSandbox-Bundle-Entry': path.relative(project.rootDir, project.entryFile).replaceAll(path.sep, '/'),
        'X-RodSandbox-Bundle-Format': options.format,
      },
    });
  } catch (error) {
    return errorResponse(error);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

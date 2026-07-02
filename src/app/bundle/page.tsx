import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Bundle Upload · RodSandbox',
  description: 'Upload a TypeScript or JavaScript file, or a zipped project, and download an esbuild bundle.',
};

export default function BundlePage() {
  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-8 text-neutral-100">
      <section className="mx-auto flex max-w-2xl flex-col gap-6 rounded-3xl border border-neutral-800 bg-neutral-900/70 p-5 shadow-2xl sm:p-8">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-400">RodSandbox</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Bundle builder</h1>
          <p className="text-sm leading-6 text-neutral-400">
            Envie um <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-200">.zip</code> com projeto ou um arquivo
            <code className="ml-1 rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-200">.ts/.js</code>. O servidor instala dependências quando existe
            <code className="ml-1 rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-200">package.json</code>, roda esbuild e devolve um download com banner de build.
          </p>
        </div>

        <form action="/api/bundle" method="post" encType="multipart/form-data" className="flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm font-medium text-neutral-300">
            Arquivo ou ZIP
            <input
              name="file"
              type="file"
              required
              accept=".zip,.ts,.tsx,.js,.jsx,.mjs,.cjs"
              className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm text-neutral-200 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-500 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-neutral-300">
            Entry opcional para ZIP
            <input
              name="entry"
              type="text"
              placeholder="src/index.ts"
              className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm text-neutral-100 outline-none transition focus:border-sky-500/70 focus:ring-2 focus:ring-sky-500/20"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm font-medium text-neutral-300">
              Formato
              <select name="format" defaultValue="iife" className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm text-neutral-100">
                <option value="iife">IIFE</option>
                <option value="esm">ESM</option>
                <option value="cjs">CJS</option>
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium text-neutral-300">
              Global IIFE
              <input
                name="global"
                type="text"
                defaultValue="RodBundle"
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm text-neutral-100 outline-none transition focus:border-sky-500/70 focus:ring-2 focus:ring-sky-500/20"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium text-neutral-300">
              Plataforma
              <select name="platform" defaultValue="browser" className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm text-neutral-100">
                <option value="browser">Browser</option>
                <option value="node">Node</option>
                <option value="neutral">Neutral</option>
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium text-neutral-300">
              Target
              <input
                name="target"
                type="text"
                defaultValue="es2020"
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm text-neutral-100 outline-none transition focus:border-sky-500/70 focus:ring-2 focus:ring-sky-500/20"
              />
            </label>
          </div>

          <label className="flex flex-col gap-2 text-sm font-medium text-neutral-300">
            External opcional, separado por vírgula
            <input
              name="external"
              type="text"
              placeholder="react, react-dom"
              className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm text-neutral-100 outline-none transition focus:border-sky-500/70 focus:ring-2 focus:ring-sky-500/20"
            />
          </label>

          <label className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-950/70 px-3 py-3 text-sm text-neutral-300">
            <input name="minify" value="true" type="checkbox" className="h-4 w-4 accent-sky-500" />
            Minificar bundle
          </label>

          <button
            type="submit"
            className="rounded-xl bg-sky-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-sky-950/40 transition hover:bg-sky-400 active:bg-sky-600"
          >
            Gerar bundle e baixar
          </button>
        </form>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-xs leading-6 text-neutral-400">
          <p className="font-semibold text-neutral-300">Shortcut/API</p>
          <p>
            Faça um <code className="rounded bg-neutral-800 px-1 py-0.5 text-neutral-200">POST multipart/form-data</code> para
            <code className="ml-1 rounded bg-neutral-800 px-1 py-0.5 text-neutral-200">/api/bundle</code> com o campo
            <code className="ml-1 rounded bg-neutral-800 px-1 py-0.5 text-neutral-200">file</code>.
          </p>
        </div>
      </section>
    </main>
  );
}

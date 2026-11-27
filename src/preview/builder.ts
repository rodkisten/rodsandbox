import { VirtualFile } from '@/types';

export interface PreviewBuildInput {
  runId?: string;
  /** All virtual files by their ID */
  files: Record<string, VirtualFile>;
  /** Compiled JS output from BrowserTypeScriptCompiler: path → JS content */
  compiledFiles: Record<string, string>;
  /** Additional scripts injected by plugins */
  injectedScripts?: string[];
  /** Optional bundled application JavaScript produced by esbuild */
  bundledCode?: string;
  /** Optional bundled CSS emitted by esbuild */
  bundledCssText?: string;
  importMap?: Record<string, string>;
}

function sanitizeInlineScriptContent(scriptContent: string): string {
  return scriptContent
    .replace(/<script/gi, '\\x3Cscript')
    .replace(/<\/script/gi, '<\\/script');
}

const consoleInterceptor = (runId?: string) => `
(function() {
  var _postMessage = function(data) {
    var target = window.opener || window.parent;
    try { target.postMessage(Object.assign({}, data, { runId: ${JSON.stringify(runId ?? null).replace(/</g, '\\u003c')} }), '*'); } catch(e) {}
  };

  function safeSerialize(val, seen) {
    if (!seen) seen = [];
    if (val === null) return { type: 'null' };
    if (val === undefined) return { type: 'undefined' };
    var t = typeof val;
    if (t === 'string') return { type: 'string', value: val };
    if (t === 'number') return { type: 'number', value: val };
    if (t === 'boolean') return { type: 'boolean', value: val };
    if (t === 'function') return { type: 'function', name: val.name || '' };
    if (t === 'symbol') return { type: 'symbol', description: String(val.description || '') };
    if (t === 'object') {
      if (seen.indexOf(val) !== -1) return { type: 'circular' };
      seen.push(val);
      if (val instanceof Date) {
        seen.pop();
        return { type: 'string', value: val.toISOString() };
      }
      if (val instanceof RegExp) {
        seen.pop();
        return { type: 'string', value: String(val) };
      }
      if (val instanceof Map) {
        var mapEntries = Array.from(val.entries()).slice(0, 50).map(function(entry) {
          return [String(entry[0]), safeSerialize(entry[1], seen.slice())];
        });
        seen.pop();
        return { type: 'object', preview: 'Map(' + val.size + ')', entries: mapEntries };
      }
      if (val instanceof Set) {
        var setValues = Array.from(val.values()).slice(0, 50).map(function(item, index) {
          return [String(index), safeSerialize(item, seen.slice())];
        });
        seen.pop();
        return { type: 'object', preview: 'Set(' + val.size + ')', entries: setValues };
      }
      if (typeof Promise !== 'undefined' && val instanceof Promise) {
        seen.pop();
        return { type: 'string', value: '[Promise]' };
      }
      if (typeof Element !== 'undefined' && val instanceof Element) {
        seen.pop();
        return { type: 'string', value: '<' + val.tagName.toLowerCase() + (val.id ? '#' + val.id : '') + '>' };
      }
      if (val instanceof Error) {
        seen.pop();
        return { type: 'error', name: val.name, message: val.message, stack: val.stack };
      }
      if (Array.isArray(val)) {
        var items = val.slice(0,50).map(function(i){ return safeSerialize(i, seen.slice()); });
        seen.pop();
        return { type: 'array', items: items, length: val.length };
      }
      var keys = Object.keys(val).slice(0, 50);
      var entries = keys.map(function(k){ return [k, safeSerialize(val[k], seen.slice())]; });
      var preview = '{' + keys.slice(0,3).join(', ') + (keys.length > 3 ? ', \u2026' : '') + '}';
      seen.pop();
      return { type: 'object', preview: preview, entries: entries };
    }
    return { type: 'string', value: String(val) };
  }

  var levels = ['log','info','warn','error','debug','table','group','groupEnd','time','timeEnd','assert'];
  var _originals = {};
  levels.forEach(function(level) {
    _originals[level] = console[level] ? console[level].bind(console) : function(){};
    console[level] = function() {
      var args = Array.prototype.slice.call(arguments);
      _originals[level].apply(console, args);
      _postMessage({
        type: 'CONSOLE_LOG',
        level: level,
        args: args.map(function(a){ return safeSerialize(a); }),
        timestamp: Date.now()
      });
    };
  });

  window.onerror = function(msg, src, line, col, err) {
    _postMessage({
      type: 'RUNTIME_ERROR',
      message: typeof msg === 'string' ? msg : String(msg),
      stack: err ? err.stack : undefined,
      timestamp: Date.now()
    });
    return false;
  };

  window.addEventListener('unhandledrejection', function(e) {
    var reason = e.reason;
    var msg = reason instanceof Error ? reason.message : String(reason);
    var stack = reason instanceof Error ? reason.stack : undefined;
    _postMessage({
      type: 'RUNTIME_ERROR',
      message: 'Unhandled Promise Rejection: ' + msg,
      stack: stack,
      timestamp: Date.now()
    });
  });

  window.addEventListener('message', function(event) {
    if (!event || !event.data || event.data.type !== 'REPL_EVAL') return;
    var code = typeof event.data.code === 'string' ? event.data.code : '';
    if (!code) return;
    (async function() {
      try {
        var AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        var evaluator;
        try {
          evaluator = new AsyncFunction('return (' + code + ')');
        } catch (_syntaxExpression) {
          evaluator = new AsyncFunction(code);
        }
        var timeoutPromise = new Promise(function(_, reject) {
          setTimeout(function() { reject(new Error('Evaluation timed out')); }, 4000);
        });
        var result = await Promise.race([evaluator.call(window), timeoutPromise]);
        _postMessage({
          type: 'REPL_RESULT',
          success: true,
          args: [safeSerialize(result)],
          timestamp: Date.now()
        });
      } catch (error) {
        var err = error instanceof Error ? error : new Error(String(error));
        _postMessage({
          type: 'REPL_RESULT',
          success: false,
          message: err.message,
          stack: err.stack,
          timestamp: Date.now()
        });
      }
    })();
  });
})();
`;

function getRunnableScriptContent(file: VirtualFile, compiledFiles: Record<string, string>): string {
  const compiledPath = file.path.replace(/\.tsx?$/, '.js');
  const compiled = compiledFiles[compiledPath] ?? compiledFiles[file.path];

  if (compiled) {
    return compiled;
  }

  if (file.language === 'javascript') {
    return file.content;
  }

  return `/* ${file.name} was not executed because the TypeScript compiler is still loading. */`;
}

export function buildPreviewHtml(input: PreviewBuildInput): string {
  const allFiles = Object.values(input.files);
  const compiledFiles = input.compiledFiles;

  const htmlFile = allFiles.find(
    (f) => f.language === 'html' && (f.name === 'index.html' || f.path === 'index.html')
  );
  const cssFiles = allFiles.filter((f) => f.language === 'css');
  const tsFiles = allFiles.filter(
    (f) => f.language === 'typescript' || f.language === 'javascript'
  );

  let rawHtml = htmlFile?.content ?? '<!DOCTYPE html><html><head></head><body></body></html>';

  // Bundled virtual scripts must not also resolve against the deployed asset origin.
  // DOMParser keeps external scripts and inline user HTML intact without regex HTML parsing.
  const document = new DOMParser().parseFromString(rawHtml, 'text/html');
  const outputs = new Set(Object.keys(compiledFiles));
  for (const script of document.querySelectorAll('script[src]')) {
    const source = script.getAttribute('src') ?? '';
    const path = source.replace(/^\.\//, '').split(/[?#]/, 1)[0];
    if (outputs.has(path) || outputs.has(path.replace(/\.tsx?$/, '.js'))) script.remove();
  }
  const originalDoctype = /^(<!DOCTYPE[^>]*>)/i.exec(rawHtml.trimStart())?.[1] ?? '';
  rawHtml = originalDoctype + document.documentElement.outerHTML;

  const bodyMatch = /<body[^>]*>([\s\S]*)<\/body\s*>/i.exec(rawHtml);
  const headMatch = /<head[^>]*>([\s\S]*)<\/head\s*>/i.exec(rawHtml);
  const doctypeMatch = /^(<!DOCTYPE[^>]*>)/i.exec(rawHtml.trimStart());

  const doctype = doctypeMatch ? doctypeMatch[1] + '\n' : '';

  // Strip external stylesheet links from head (replaced by inline <style>)
  const headContent = (headMatch ? headMatch[1] : '')
    .replace(/<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*>/gi, '');

  const bodyContent = bodyMatch ? bodyMatch[1] : '<h1>Hello, Playground!</h1>';

  // Build inline CSS block
  const cssBlocks = cssFiles.map((f) => `/* ${f.name} */\n${f.content}`).join('\n');
  const mergedCss = [cssBlocks, input.bundledCssText ?? ''].filter(Boolean).join('\n');
  const styleTag = mergedCss ? `<style>\n${mergedCss}\n</style>` : '';

  // Build JS blocks — prefer compiled output, fall back to raw JavaScript only.
  const jsBlocks = tsFiles.map((f) => {
    const js = getRunnableScriptContent(f, compiledFiles);
    return `/* ${f.name} */\n${js}`;
  }).join('\n');

  const interceptorScript = `<script>\n${sanitizeInlineScriptContent(consoleInterceptor(input.runId))}\n</script>`;
  const runtimeScript = input.bundledCode && input.bundledCode.trim().length > 0 ? input.bundledCode : jsBlocks;
  const userScript = runtimeScript ? `<script${input.bundledCode?.trim() ? ' type="module"' : ''}>\n${sanitizeInlineScriptContent(runtimeScript)}\n</script>` : '';
  const encodedPluginScripts = (input.injectedScripts ?? []).map((script) =>
    encodeURIComponent(script),
  );
  const pluginScripts = encodedPluginScripts.length > 0
    ? `<script>
      (function() {
        var scripts = ${JSON.stringify(encodedPluginScripts)};
        scripts.forEach(function(encoded) {
          var element = document.createElement('script');
          element.textContent = decodeURIComponent(encoded);
          document.body.appendChild(element);
        });
      })();
    </script>`
    : '';

  const importMapTag = input.importMap && Object.keys(input.importMap).length
    ? '<script type="importmap">' + JSON.stringify({ imports: input.importMap }).replace(/</g, '\\u003c') + '</script>'
    : '';
  return [
    doctype,
    '<html lang="en">',
    '<head>',
    importMapTag,
    headContent,
    styleTag,
    '</head>',
    '<body>',
    bodyContent,
    interceptorScript,
    pluginScripts,
    userScript,
    '</body>',
    '</html>',
  ].join('\n');
}

import { VirtualFile } from '@/types';

export interface PreviewBuildInput {
  /** All virtual files by their ID */
  files: Record<string, VirtualFile>;
  /** Compiled JS output from BrowserTypeScriptCompiler: path → JS content */
  compiledFiles: Record<string, string>;
}

const CONSOLE_INTERCEPTOR = `
(function() {
  var _postMessage = function(data) {
    try { window.parent.postMessage(data, '*'); } catch(e) {}
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
})();
`;

function stripTypeScriptTypes(ts: string): string {
  return ts
    .replace(/^\s*interface\s+\w+[^}]*}\s*$/gm, '')
    .replace(/^\s*type\s+\w+\s*=.*$/gm, '')
    .replace(/:\s*(string|number|boolean|void|any|unknown|never|null|undefined|[A-Z]\w*(\[\])?(\s*\|\s*[A-Z]\w*(\[\])?)*)\s*(?=[,)={])/g, '')
    .replace(/<[A-Z]\w*(\s*,\s*[A-Z]\w*)*>/g, '')
    .replace(/^\s*export\s+type\s+.*$/gm, '')
    .replace(/^\s*import\s+type\s+.*$/gm, '')
    .replace(/\bas\s+\w+/g, '');
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

  const rawHtml = htmlFile?.content ?? '<!DOCTYPE html><html><head></head><body></body></html>';

  const bodyMatch = /<body[^>]*>([\s\S]*)<\/body\s*>/i.exec(rawHtml);
  const headMatch = /<head[^>]*>([\s\S]*)<\/head\s*>/i.exec(rawHtml);
  const doctypeMatch = /^(<!DOCTYPE[^>]*>)/i.exec(rawHtml.trimStart());

  const doctype = doctypeMatch ? doctypeMatch[1] + '\n' : '';

  // Strip external stylesheet links from head (replaced by inline <style>)
  const headContent = (headMatch ? headMatch[1] : '')
    .replace(/<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*>/gi, '');

  // Strip external <script src> tags from body (replaced by inlined scripts)
  const bodyContent = (bodyMatch ? bodyMatch[1] : '<h1>Hello, Playground!</h1>')
    .replace(/<script\b[^>]*\bsrc\s*=[^>]*><\/script>/gi, '');

  // Build inline CSS block
  const cssBlocks = cssFiles.map((f) => `/* ${f.name} */\n${f.content}`).join('\n');
  const styleTag = cssBlocks ? `<style>\n${cssBlocks}\n</style>` : '';

  // Build JS blocks — prefer compiled output, fall back to stripping TS types
  const jsBlocks = tsFiles.map((f) => {
    const compiledPath = f.path.replace(/\.tsx?$/, '.js');
    const js = compiledFiles[compiledPath] ?? compiledFiles[f.path] ?? stripTypeScriptTypes(f.content);
    return `/* ${f.name} */\n${js}`;
  }).join('\n');

  const interceptorScript = `<script>\n${CONSOLE_INTERCEPTOR}\n</script>`;
  const userScript = jsBlocks ? `<script type="module">\n${jsBlocks}\n</script>` : '';

  return [
    doctype,
    '<html lang="en">',
    '<head>',
    headContent,
    styleTag,
    '</head>',
    '<body>',
    bodyContent,
    interceptorScript,
    userScript,
    '</body>',
    '</html>',
  ].join('\n');
}

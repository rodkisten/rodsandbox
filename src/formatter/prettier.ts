import type { Plugin } from 'prettier';
import type { FileLanguage } from '@/types';

export class FormatterError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'FormatterError';
  }
}

/** Maps our FileLanguage to the Prettier parser name. */
function getPrettierParser(language: FileLanguage): string | null {
  switch (language) {
    case 'typescript': return 'babel-ts';
    case 'javascript': return 'babel';
    case 'html':       return 'html';
    case 'css':        return 'css';
    case 'json':       return 'json';
    case 'markdown':   return 'markdown';
    default:           return null;
  }
}

/**
 * Formats a file's content using Prettier standalone (browser-safe).
 * Parsers are dynamically imported so only the required one is loaded.
 */
export async function formatFile(
  content: string,
  language: FileLanguage
): Promise<string> {
  const parser = getPrettierParser(language);
  if (parser === null) {
    return content;
  }

  try {
    const [{ format }, plugins] = await Promise.all([
      import('prettier/standalone'),
      loadPlugins(language),
    ]);

    const formatted = await format(content, {
      parser,
      plugins: plugins as Plugin[],
      printWidth: 80,
      tabWidth: 2,
      useTabs: false,
      semi: true,
      singleQuote: true,
      trailingComma: 'es5',
      bracketSpacing: true,
      arrowParens: 'always',
    });

    return formatted;
  } catch (err) {
    throw new FormatterError(
      `Failed to format ${language} file: ${err instanceof Error ? err.message : String(err)}`,
      err
    );
  }
}

async function loadPlugins(language: FileLanguage): Promise<Plugin[]> {
  switch (language) {
    case 'typescript':
    case 'javascript':
    case 'json': {
      const [babel, estree] = await Promise.all([
        import('prettier/plugins/babel'),
        import('prettier/plugins/estree'),
      ]);
      return [babel.default ?? babel, estree.default ?? estree];
    }
    case 'html': {
      const [htmlPlugin] = await Promise.all([import('prettier/plugins/html')]);
      return [htmlPlugin.default ?? htmlPlugin];
    }
    case 'css': {
      const [postcss] = await Promise.all([import('prettier/plugins/postcss')]);
      return [postcss.default ?? postcss];
    }
    case 'markdown': {
      const [md] = await Promise.all([import('prettier/plugins/markdown')]);
      return [md.default ?? md];
    }
    default:
      return [];
  }
}

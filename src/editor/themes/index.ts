/**
 * CodeMirror 6 theme catalogue.
 * All themes are built with `createTheme` from @uiw/codemirror-themes.
 *
 * Usage:
 *   import { getEditorTheme } from '@/editor/themes';
 *   <CodeMirror theme={getEditorTheme('github-dark')} />
 */

import { tags as t } from '@lezer/highlight';
import { createTheme } from '@uiw/codemirror-themes';
import type { Extension } from '@codemirror/state';

// ─── GitHub Dark ──────────────────────────────────────────────────────────────

export const githubDark = createTheme({
  theme: 'dark',
  settings: {
    background: '#0d1117',
    foreground: '#c9d1d9',
    caret: '#58a6ff',
    selection: '#264f7840',
    selectionMatch: '#264f7840',
    gutterBackground: '#0d1117',
    gutterForeground: '#484f58',
    lineHighlight: '#161b2260',
  },
  styles: [
    { tag: t.keyword, color: '#ff7b72' },
    { tag: [t.name, t.deleted, t.character, t.macroName], color: '#c9d1d9' },
    { tag: [t.function(t.variableName), t.labelName], color: '#d2a8ff' },
    { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#79c0ff' },
    { tag: [t.definition(t.name), t.separator], color: '#c9d1d9' },
    { tag: [t.typeName, t.className], color: '#ffa657' },
    { tag: [t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: '#79c0ff' },
    { tag: [t.operator, t.operatorKeyword], color: '#ff7b72' },
    { tag: [t.url, t.escape, t.regexp, t.link], color: '#a5d6ff' },
    { tag: [t.meta, t.comment], color: '#8b949e' },
    { tag: [t.processingInstruction, t.string, t.inserted, t.special(t.string)], color: '#a5d6ff' },
    { tag: [t.atom, t.bool, t.special(t.variableName)], color: '#79c0ff' },
    { tag: t.propertyName, color: '#79c0ff' },
    { tag: t.strong, fontWeight: 'bold' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.link, textDecoration: 'underline' },
    { tag: t.heading, fontWeight: 'bold', color: '#1f6feb' },
    { tag: t.invalid, color: '#f85149' },
    { tag: t.strikethrough, textDecoration: 'line-through' },
  ],
});

// ─── GitHub Light ─────────────────────────────────────────────────────────────

export const githubLight = createTheme({
  theme: 'light',
  settings: {
    background: '#ffffff',
    foreground: '#24292e',
    caret: '#0969da',
    selection: '#0969da33',
    selectionMatch: '#0969da22',
    gutterBackground: '#ffffff',
    gutterForeground: '#8c959f',
    lineHighlight: '#f6f8fa',
  },
  styles: [
    { tag: t.keyword, color: '#cf222e' },
    { tag: [t.name, t.deleted, t.character, t.macroName], color: '#24292e' },
    { tag: [t.function(t.variableName), t.labelName], color: '#6639ba' },
    { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#0550ae' },
    { tag: [t.definition(t.name), t.separator], color: '#24292e' },
    { tag: [t.typeName, t.className], color: '#e36209' },
    { tag: [t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: '#0550ae' },
    { tag: [t.operator, t.operatorKeyword], color: '#cf222e' },
    { tag: [t.url, t.escape, t.regexp, t.link], color: '#0a3069' },
    { tag: [t.meta, t.comment], color: '#6e7781' },
    { tag: [t.processingInstruction, t.string, t.inserted, t.special(t.string)], color: '#0a3069' },
    { tag: [t.atom, t.bool, t.special(t.variableName)], color: '#0550ae' },
    { tag: t.propertyName, color: '#0550ae' },
    { tag: t.strong, fontWeight: 'bold' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.link, textDecoration: 'underline' },
    { tag: t.heading, fontWeight: 'bold', color: '#0969da' },
    { tag: t.invalid, color: '#cf222e' },
    { tag: t.strikethrough, textDecoration: 'line-through' },
  ],
});

// ─── Dracula ──────────────────────────────────────────────────────────────────

export const dracula = createTheme({
  theme: 'dark',
  settings: {
    background: '#282a36',
    foreground: '#f8f8f2',
    caret: '#f8f8f2',
    selection: '#44475a',
    selectionMatch: '#44475a',
    gutterBackground: '#282a36',
    gutterForeground: '#6272a4',
    lineHighlight: '#44475a55',
  },
  styles: [
    { tag: t.keyword, color: '#ff79c6' },
    { tag: [t.name, t.deleted, t.character, t.macroName], color: '#f8f8f2' },
    { tag: [t.function(t.variableName), t.labelName], color: '#50fa7b' },
    { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#bd93f9' },
    { tag: [t.definition(t.name), t.separator], color: '#f8f8f2' },
    { tag: [t.typeName, t.className], color: '#8be9fd' },
    { tag: [t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: '#bd93f9' },
    { tag: [t.operator, t.operatorKeyword], color: '#ff79c6' },
    { tag: [t.url, t.escape, t.regexp, t.link], color: '#f1fa8c' },
    { tag: [t.meta, t.comment], color: '#6272a4' },
    { tag: [t.processingInstruction, t.string, t.inserted, t.special(t.string)], color: '#f1fa8c' },
    { tag: [t.atom, t.bool, t.special(t.variableName)], color: '#bd93f9' },
    { tag: t.propertyName, color: '#66d9e8' },
    { tag: t.strong, fontWeight: 'bold' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.link, textDecoration: 'underline' },
    { tag: t.heading, fontWeight: 'bold', color: '#ff79c6' },
    { tag: t.invalid, color: '#ff5555' },
    { tag: t.strikethrough, textDecoration: 'line-through' },
  ],
});

// ─── Monokai ──────────────────────────────────────────────────────────────────

export const monokai = createTheme({
  theme: 'dark',
  settings: {
    background: '#272822',
    foreground: '#f8f8f2',
    caret: '#f8f8f0',
    selection: '#49483e',
    selectionMatch: '#49483e',
    gutterBackground: '#272822',
    gutterForeground: '#75715e',
    lineHighlight: '#3e3d3255',
  },
  styles: [
    { tag: t.keyword, color: '#f92672' },
    { tag: [t.name, t.deleted, t.character, t.macroName], color: '#f8f8f2' },
    { tag: [t.function(t.variableName), t.labelName], color: '#a6e22e' },
    { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#ae81ff' },
    { tag: [t.definition(t.name), t.separator], color: '#f8f8f2' },
    { tag: [t.typeName, t.className], color: '#66d9e8' },
    { tag: [t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: '#ae81ff' },
    { tag: [t.operator, t.operatorKeyword], color: '#f92672' },
    { tag: [t.url, t.escape, t.regexp, t.link], color: '#e6db74' },
    { tag: [t.meta, t.comment], color: '#75715e' },
    { tag: [t.processingInstruction, t.string, t.inserted, t.special(t.string)], color: '#e6db74' },
    { tag: [t.atom, t.bool, t.special(t.variableName)], color: '#ae81ff' },
    { tag: t.propertyName, color: '#a6e22e' },
    { tag: t.strong, fontWeight: 'bold' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.link, textDecoration: 'underline' },
    { tag: t.heading, fontWeight: 'bold', color: '#f92672' },
    { tag: t.invalid, color: '#f92672' },
    { tag: t.strikethrough, textDecoration: 'line-through' },
  ],
});

// ─── Nord ─────────────────────────────────────────────────────────────────────

export const nord = createTheme({
  theme: 'dark',
  settings: {
    background: '#2e3440',
    foreground: '#d8dee9',
    caret: '#81a1c1',
    selection: '#434c5e',
    selectionMatch: '#434c5e',
    gutterBackground: '#2e3440',
    gutterForeground: '#4c566a',
    lineHighlight: '#3b425580',
  },
  styles: [
    { tag: t.keyword, color: '#81a1c1' },
    { tag: [t.name, t.deleted, t.character, t.macroName], color: '#d8dee9' },
    { tag: [t.function(t.variableName), t.labelName], color: '#88c0d0' },
    { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#81a1c1' },
    { tag: [t.definition(t.name), t.separator], color: '#d8dee9' },
    { tag: [t.typeName, t.className], color: '#8fbcbb' },
    { tag: [t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: '#b48ead' },
    { tag: [t.operator, t.operatorKeyword], color: '#81a1c1' },
    { tag: [t.url, t.escape, t.regexp, t.link], color: '#a3be8c' },
    { tag: [t.meta, t.comment], color: '#616e88' },
    { tag: [t.processingInstruction, t.string, t.inserted, t.special(t.string)], color: '#a3be8c' },
    { tag: [t.atom, t.bool, t.special(t.variableName)], color: '#81a1c1' },
    { tag: t.propertyName, color: '#88c0d0' },
    { tag: t.strong, fontWeight: 'bold' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.link, textDecoration: 'underline' },
    { tag: t.heading, fontWeight: 'bold', color: '#88c0d0' },
    { tag: t.invalid, color: '#bf616a' },
    { tag: t.strikethrough, textDecoration: 'line-through' },
  ],
});

// ─── Solarized Dark ───────────────────────────────────────────────────────────

export const solarizedDark = createTheme({
  theme: 'dark',
  settings: {
    background: '#002b36',
    foreground: '#839496',
    caret: '#839496',
    selection: '#073642',
    selectionMatch: '#073642',
    gutterBackground: '#002b36',
    gutterForeground: '#586e75',
    lineHighlight: '#07364280',
  },
  styles: [
    { tag: t.keyword, color: '#859900' },
    { tag: [t.name, t.deleted, t.character, t.macroName], color: '#839496' },
    { tag: [t.function(t.variableName), t.labelName], color: '#268bd2' },
    { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#2aa198' },
    { tag: [t.definition(t.name), t.separator], color: '#839496' },
    { tag: [t.typeName, t.className], color: '#b58900' },
    { tag: [t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: '#2aa198' },
    { tag: [t.operator, t.operatorKeyword], color: '#859900' },
    { tag: [t.url, t.escape, t.regexp, t.link], color: '#2aa198' },
    { tag: [t.meta, t.comment], color: '#586e75' },
    { tag: [t.processingInstruction, t.string, t.inserted, t.special(t.string)], color: '#2aa198' },
    { tag: [t.atom, t.bool, t.special(t.variableName)], color: '#cb4b16' },
    { tag: t.propertyName, color: '#268bd2' },
    { tag: t.strong, fontWeight: 'bold' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.link, textDecoration: 'underline' },
    { tag: t.heading, fontWeight: 'bold', color: '#268bd2' },
    { tag: t.invalid, color: '#dc322f' },
    { tag: t.strikethrough, textDecoration: 'line-through' },
  ],
});

// ─── Solarized Light ──────────────────────────────────────────────────────────

export const solarizedLight = createTheme({
  theme: 'light',
  settings: {
    background: '#fdf6e3',
    foreground: '#657b83',
    caret: '#657b83',
    selection: '#eee8d5',
    selectionMatch: '#eee8d5',
    gutterBackground: '#fdf6e3',
    gutterForeground: '#93a1a1',
    lineHighlight: '#eee8d580',
  },
  styles: [
    { tag: t.keyword, color: '#859900' },
    { tag: [t.name, t.deleted, t.character, t.macroName], color: '#657b83' },
    { tag: [t.function(t.variableName), t.labelName], color: '#268bd2' },
    { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#2aa198' },
    { tag: [t.definition(t.name), t.separator], color: '#657b83' },
    { tag: [t.typeName, t.className], color: '#b58900' },
    { tag: [t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: '#2aa198' },
    { tag: [t.operator, t.operatorKeyword], color: '#859900' },
    { tag: [t.url, t.escape, t.regexp, t.link], color: '#2aa198' },
    { tag: [t.meta, t.comment], color: '#93a1a1' },
    { tag: [t.processingInstruction, t.string, t.inserted, t.special(t.string)], color: '#2aa198' },
    { tag: [t.atom, t.bool, t.special(t.variableName)], color: '#cb4b16' },
    { tag: t.propertyName, color: '#268bd2' },
    { tag: t.strong, fontWeight: 'bold' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.link, textDecoration: 'underline' },
    { tag: t.heading, fontWeight: 'bold', color: '#268bd2' },
    { tag: t.invalid, color: '#dc322f' },
    { tag: t.strikethrough, textDecoration: 'line-through' },
  ],
});

// ─── One Dark ─────────────────────────────────────────────────────────────────

export const oneDark = createTheme({
  theme: 'dark',
  settings: {
    background: '#282c34',
    foreground: '#abb2bf',
    caret: '#528bff',
    selection: '#3e4451',
    selectionMatch: '#3e4451',
    gutterBackground: '#282c34',
    gutterForeground: '#636d83',
    lineHighlight: '#2c313c',
  },
  styles: [
    { tag: t.keyword, color: '#c678dd' },
    { tag: [t.name, t.deleted, t.character, t.macroName], color: '#e06c75' },
    { tag: [t.function(t.variableName), t.labelName], color: '#61afef' },
    { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#d19a66' },
    { tag: [t.definition(t.name), t.separator], color: '#abb2bf' },
    { tag: [t.typeName, t.className], color: '#e5c07b' },
    { tag: [t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: '#d19a66' },
    { tag: [t.operator, t.operatorKeyword], color: '#56b6c2' },
    { tag: [t.url, t.escape, t.regexp, t.link], color: '#98c379' },
    { tag: [t.meta, t.comment], color: '#5c6370' },
    { tag: [t.processingInstruction, t.string, t.inserted, t.special(t.string)], color: '#98c379' },
    { tag: [t.atom, t.bool, t.special(t.variableName)], color: '#d19a66' },
    { tag: t.propertyName, color: '#61afef' },
    { tag: t.strong, fontWeight: 'bold' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.link, textDecoration: 'underline' },
    { tag: t.heading, fontWeight: 'bold', color: '#e06c75' },
    { tag: t.invalid, color: '#f44747' },
    { tag: t.strikethrough, textDecoration: 'line-through' },
  ],
});

// ─── Tokyo Night ──────────────────────────────────────────────────────────────

export const tokyoNight = createTheme({
  theme: 'dark',
  settings: {
    background: '#1a1b26',
    foreground: '#c0caf5',
    caret: '#c0caf5',
    selection: '#283457',
    selectionMatch: '#283457',
    gutterBackground: '#1a1b26',
    gutterForeground: '#3b4261',
    lineHighlight: '#20213380',
  },
  styles: [
    { tag: t.keyword, color: '#9d7cd8' },
    { tag: [t.name, t.deleted, t.character, t.macroName], color: '#c0caf5' },
    { tag: [t.function(t.variableName), t.labelName], color: '#7aa2f7' },
    { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#ff9e64' },
    { tag: [t.definition(t.name), t.separator], color: '#c0caf5' },
    { tag: [t.typeName, t.className], color: '#2ac3de' },
    { tag: [t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: '#ff9e64' },
    { tag: [t.operator, t.operatorKeyword], color: '#89ddff' },
    { tag: [t.url, t.escape, t.regexp, t.link], color: '#9ece6a' },
    { tag: [t.meta, t.comment], color: '#565f89' },
    { tag: [t.processingInstruction, t.string, t.inserted, t.special(t.string)], color: '#9ece6a' },
    { tag: [t.atom, t.bool, t.special(t.variableName)], color: '#ff9e64' },
    { tag: t.propertyName, color: '#73daca' },
    { tag: t.strong, fontWeight: 'bold' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.link, textDecoration: 'underline' },
    { tag: t.heading, fontWeight: 'bold', color: '#7aa2f7' },
    { tag: t.invalid, color: '#f7768e' },
    { tag: t.strikethrough, textDecoration: 'line-through' },
  ],
});

// ─── Midnight (dark custom) ───────────────────────────────────────────────────

export const midnight = createTheme({
  theme: 'dark',
  settings: {
    background: '#020617',
    foreground: '#e2e8f0',
    caret: '#38bdf8',
    selection: '#1e3a5f',
    selectionMatch: '#1e3a5f',
    gutterBackground: '#0f172a',
    gutterForeground: '#94a3b8',
    lineHighlight: '#0f172a80',
  },
  styles: [
    { tag: t.keyword, color: '#818cf8' },
    { tag: [t.name, t.deleted, t.character, t.macroName], color: '#e2e8f0' },
    { tag: [t.function(t.variableName), t.labelName], color: '#38bdf8' },
    { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#f472b6' },
    { tag: [t.definition(t.name), t.separator], color: '#e2e8f0' },
    { tag: [t.typeName, t.className], color: '#34d399' },
    { tag: [t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: '#f472b6' },
    { tag: [t.operator, t.operatorKeyword], color: '#818cf8' },
    { tag: [t.url, t.escape, t.regexp, t.link], color: '#4ade80' },
    { tag: [t.meta, t.comment], color: '#475569' },
    { tag: [t.processingInstruction, t.string, t.inserted, t.special(t.string)], color: '#4ade80' },
    { tag: [t.atom, t.bool, t.special(t.variableName)], color: '#f472b6' },
    { tag: t.propertyName, color: '#38bdf8' },
    { tag: t.strong, fontWeight: 'bold' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.link, textDecoration: 'underline' },
    { tag: t.heading, fontWeight: 'bold', color: '#38bdf8' },
    { tag: t.invalid, color: '#f87171' },
    { tag: t.strikethrough, textDecoration: 'line-through' },
  ],
});

// ─── Registry ─────────────────────────────────────────────────────────────────

export const EDITOR_THEMES = {
  'github-dark': { label: 'GitHub Dark', theme: githubDark, dark: true },
  'github-light': { label: 'GitHub Light', theme: githubLight, dark: false },
  dracula: { label: 'Dracula', theme: dracula, dark: true },
  monokai: { label: 'Monokai', theme: monokai, dark: true },
  nord: { label: 'Nord', theme: nord, dark: true },
  'solarized-dark': { label: 'Solarized Dark', theme: solarizedDark, dark: true },
  'solarized-light': { label: 'Solarized Light', theme: solarizedLight, dark: false },
  'one-dark': { label: 'One Dark', theme: oneDark, dark: true },
  'tokyo-night': { label: 'Tokyo Night', theme: tokyoNight, dark: true },
  midnight: { label: 'Midnight', theme: midnight, dark: true },
} as const;

export type EditorThemeKey = keyof typeof EDITOR_THEMES;

export function getEditorTheme(key: EditorThemeKey): Extension {
  return EDITOR_THEMES[key]?.theme ?? githubDark;
}

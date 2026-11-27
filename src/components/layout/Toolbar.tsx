'use client';
import React from 'react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Bug, Command, Download, Layout, Menu, MoonStar, Paintbrush, Play, PlayCircle, Save, WandSparkles } from 'lucide-react';
import type { EditorTheme } from '@/types';

interface ToolbarProps {
  onRun: () => void;
  onFormat: () => void;
  onSave: () => void;
  onDownload: () => void;
  onExportZip: () => void;
  onTypecheck: () => void;
  onOpenCommands: () => void;
  onOpenEditorDetached: () => void;
  autoRun: boolean;
  onToggleAutoRun: () => void;
  isRunning?: boolean;
  isFormatting?: boolean;
  theme: 'dark' | 'light' | 'oled' | 'tokyo' | 'midnight' | 'high-contrast';
  onThemeChange: (theme: 'dark' | 'light' | 'oled' | 'tokyo' | 'midnight' | 'high-contrast') => void;
  editorTheme: EditorTheme;
  onEditorThemeChange: (theme: EditorTheme) => void;
  editorLineNumbers: boolean;
  onToggleEditorLineNumbers: () => void;
  editorWordWrap: boolean;
  onToggleEditorWordWrap: () => void;
  editorAutocomplete: boolean;
  onToggleEditorAutocomplete: () => void;
  liveTypecheck: boolean;
  onToggleLiveTypecheck: () => void;
  editorLinterEnabled: boolean;
  onToggleEditorLinter: () => void;
  editorFormatterEnabled: boolean;
  onToggleEditorFormatter: () => void;
  editorFontSize: number;
  onEditorFontSizeChange: (size: number) => void;
  editorHistoryDepth?: number;
  editorHistoryGroupDelay?: number;
  onEditorHistoryDepthChange?: (value: number) => void;
  onEditorHistoryGroupDelayChange?: (value: number) => void;
  editorTabSize: number;
  onEditorTabSizeChange: (size: number) => void;
  diagnosticsCount: number;
  panelVisibility: { files: boolean; preview: boolean; terminal: boolean };
  onToggleView: (panel: 'files' | 'preview' | 'terminal') => void;
}

export default function Toolbar({
  onRun,
  onFormat,
  onSave,
  onDownload,
  onExportZip,
  onTypecheck,
  onOpenCommands,
  onOpenEditorDetached,
  autoRun,
  onToggleAutoRun,
  isRunning = false,
  isFormatting = false,
  theme,
  onThemeChange,
  editorTheme,
  onEditorThemeChange,
  editorLineNumbers,
  onToggleEditorLineNumbers,
  editorWordWrap,
  onToggleEditorWordWrap,
  editorAutocomplete,
  onToggleEditorAutocomplete,
  liveTypecheck,
  onToggleLiveTypecheck,
  editorLinterEnabled,
  onToggleEditorLinter,
  editorFormatterEnabled,
  onToggleEditorFormatter,
  editorFontSize,
  onEditorFontSizeChange,
  editorHistoryDepth = 200,
  editorHistoryGroupDelay = 500,
  onEditorHistoryDepthChange,
  onEditorHistoryGroupDelayChange,
  editorTabSize,
  onEditorTabSizeChange,
  diagnosticsCount,
  panelVisibility,
  onToggleView,
}: ToolbarProps) {
  return (
    <div className="flex items-center gap-1.5 border-b border-neutral-800 bg-neutral-950 px-2 py-1.5 sm:px-3">
      <span className="mr-1 hidden text-xs font-semibold text-neutral-500 sm:inline">⬡</span>
      <Button
        onClick={onRun}
        disabled={isRunning}
        size="icon"
        className="size-8 rounded-md bg-neutral-900 hover:bg-emerald-500"
        title="Play (Ctrl+Enter)"
      >
        <Play className="size-4" />
      </Button>
      <Button
        onClick={onToggleAutoRun}
        size="icon"
        variant={autoRun ? 'default' : 'secondary'}
        className={autoRun ? 'bg-purple-700/30 hover:bg-purple-600' : ''}
        title="AutoPlay"
      >
        <PlayCircle className="size-4" />
      </Button>
      <div className="ml-1 rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] text-neutral-500">
        {diagnosticsCount > 0 ? `${diagnosticsCount} erros` : 'ok'}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="secondary" className="ml-auto" title="Menu">
            <Menu className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Ações</DropdownMenuLabel>
          <DropdownMenuItem onClick={onFormat}>
            <WandSparkles className="size-4" /> {isFormatting ? 'Formatando...' : 'Formatar'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onTypecheck}>
            <Bug className="size-4" /> Typecheck
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onSave}>
            <Save className="size-4" /> Salvar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenCommands}>
            <Command className="size-4" /> Command Palette
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenEditorDetached}>
            <MoonStar className="size-4" /> Detach editor
          </DropdownMenuItem>
          <DropdownMenuSeparator />

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Editor</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuCheckboxItem checked={editorLineNumbers} onCheckedChange={onToggleEditorLineNumbers}>
                Números de linha
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={editorWordWrap} onCheckedChange={onToggleEditorWordWrap}>
                Quebra de linha
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={editorAutocomplete} onCheckedChange={onToggleEditorAutocomplete}>
                Autocomplete
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={editorLinterEnabled} onCheckedChange={onToggleEditorLinter}>
                Linter inline
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={editorFormatterEnabled} onCheckedChange={onToggleEditorFormatter}>
                Formatter ativo
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={liveTypecheck} onCheckedChange={onToggleLiveTypecheck}>
                Typecheck ao digitar
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="pb-0 pt-1 text-[10px]">Fonte</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={String(editorFontSize)} onValueChange={(value) => onEditorFontSizeChange(Number(value))}>
                <DropdownMenuRadioItem value="12">12px</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="14">14px</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="16">16px</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="18">18px</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              {onEditorHistoryDepthChange && <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Histórico mínimo</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={String(editorHistoryDepth)} onValueChange={value => onEditorHistoryDepthChange(Number(value))}>
                {[100, 200, 500, 1000, 2000].map(n => <DropdownMenuRadioItem key={n} value={String(n)}>{n} alterações</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
              <DropdownMenuLabel>Agrupar alterações</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={String(editorHistoryGroupDelay)} onValueChange={value => onEditorHistoryGroupDelayChange?.(Number(value))}>
                {[0, 250, 500, 1000].map(n => <DropdownMenuRadioItem key={n} value={String(n)}>{n} ms</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
              </>}
              <DropdownMenuLabel className="pb-0 pt-1 text-[10px]">Tab Size</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={String(editorTabSize)} onValueChange={(value) => onEditorTabSizeChange(Number(value))}>
                <DropdownMenuRadioItem value="2">2 espaços</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="4">4 espaços</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Aparência</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuLabel className="pb-0 pt-1 text-[10px]">Tema da aplicação</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={theme} onValueChange={(value) => onThemeChange(value as ToolbarProps['theme'])}>
                <DropdownMenuRadioItem value="midnight">Midnight</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="oled">OLED Black</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="tokyo">Tokyo</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="high-contrast">High Contrast</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuLabel className="pb-0 pt-1 text-[10px]">Tema do editor</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={editorTheme} onValueChange={(value) => onEditorThemeChange(value as EditorTheme)}>
                <DropdownMenuRadioItem value="github-dark">GitHub Dark</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="github-light">GitHub Light</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dracula">Dracula</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="monokai">Monokai</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="nord">Nord</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="one-dark">One Dark</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="tokyo-night">Tokyo Night</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="midnight">Midnight</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="solarized-dark">Solarized Dark</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="solarized-light">Solarized Light</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger><Layout className="size-4" /> View</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuCheckboxItem checked={panelVisibility.files} onCheckedChange={() => onToggleView('files')}>
                Files
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={panelVisibility.preview} onCheckedChange={() => onToggleView('preview')}>
                Preview
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={panelVisibility.terminal} onCheckedChange={() => onToggleView('terminal')}>
                Terminal
              </DropdownMenuCheckboxItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Arquivos</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={onDownload}>
                <Download className="size-4" /> Baixar arquivo atual
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExportZip}>
                <Download className="size-4" /> Exportar ZIP
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onThemeChange(theme)}>
                <Paintbrush className="size-4" /> Aplicar tema atual
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

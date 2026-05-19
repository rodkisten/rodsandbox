import type { Diagnostic, FileLanguage } from '@/types';
export interface WorkerFileInput { path: string; content: string; language: FileLanguage; }
export interface BundlerBuildRequest { type: 'BUNDLE_BUILD'; requestId: number; files: WorkerFileInput[]; entryFile: string; }
export interface BundlerBuildSuccess { type: 'BUNDLE_RESULT'; requestId: number; success: true; code: string; cssText: string; dependencies: string[]; }
export interface BundlerBuildFailure { type: 'BUNDLE_RESULT'; requestId: number; success: false; errors: Diagnostic[]; }
export type BundlerMessage = BundlerBuildRequest | BundlerBuildSuccess | BundlerBuildFailure;
export interface FormatterRequest { type: 'FORMAT_FILE'; requestId: number; language: FileLanguage; content: string; }
export interface FormatterResult { type: 'FORMAT_RESULT'; requestId: number; success: true; formatted: string; }
export interface FormatterFailure { type: 'FORMAT_RESULT'; requestId: number; success: false; error: string; }
export type FormatterMessage = FormatterRequest | FormatterResult | FormatterFailure;
export interface TsDiagnosticsRequest { type: 'TS_DIAGNOSTICS'; requestId: number; files: Array<{ path: string; content: string }>; }
export interface TsDiagnosticsResult { type: 'TS_DIAGNOSTICS_RESULT'; requestId: number; diagnostics: Diagnostic[]; }
export type TsMessage = TsDiagnosticsRequest | TsDiagnosticsResult | TsCompletionsRequest | TsCompletionsResult | TsQuickInfoRequest | TsQuickInfoResult;

export interface TsCompletionsRequest { type: 'TS_COMPLETIONS'; requestId: number; path: string; position: number; files: Array<{ path: string; content: string }>; }
export interface TsCompletionsResult { type: 'TS_COMPLETIONS_RESULT'; requestId: number; items: Array<{ name: string; kind: string; detail?: string }>; }
export interface TsQuickInfoRequest { type: 'TS_QUICK_INFO'; requestId: number; path: string; position: number; files: Array<{ path: string; content: string }>; }
export interface TsQuickInfoResult { type: 'TS_QUICK_INFO_RESULT'; requestId: number; info: { display: string; documentation: string; kind: string } | null; }

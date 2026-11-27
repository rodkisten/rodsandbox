export interface TsCompletionItem {
  name: string;
  kind: string;
  detail?: string;
  sortText?: string;
  insertText?: string;
  documentation?: string;
}

export interface TsQuickInfo {
  display: string;
  documentation: string;
  kind: string;
}

export interface TsDefinitionLocation {
  path: string;
  line: number;
  column: number;
}

export interface TsSignatureHelp {
  prefix: string;
  suffix: string;
  separator: string;
  parameters: Array<{ display: string; documentation: string }>;
  activeParameter: number;
  documentation: string;
}

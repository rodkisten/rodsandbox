export interface TsCompletionItem {
  name: string;
  kind: string;
  detail?: string;
  sortText?: string;
  insertText?: string;
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

import type { Workspace } from '@/types';

/**
 * Triggers a browser file download using the Blob URL trick.
 * The anchor element is briefly appended to the DOM and removed after click.
 */
export function downloadFile(
  filename: string,
  content: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Delay revoke so the browser has time to initiate the download
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Serializes the entire workspace to JSON and downloads it as `workspace.json`.
 */
export function downloadWorkspaceAsJson(workspace: Workspace): void {
  const json = JSON.stringify(workspace, null, 2);
  downloadFile('workspace.json', json, 'application/json');
}

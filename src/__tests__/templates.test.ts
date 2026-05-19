import { describe, expect, it } from 'vitest';
import { getTemplateById, WORKSPACE_TEMPLATES } from '@/filesystem/templates';

describe('workspace templates', () => {
  it('contains required template ids', () => {
    const ids = WORKSPACE_TEMPLATES.map((template) => template.id);
    expect(ids).toEqual(expect.arrayContaining(['vanilla-ts', 'html-css-js', 'lit', 'preact', 'userscript', 'bookmarklet']));
  });

  it('resolves template by id', () => {
    const template = getTemplateById('vanilla-ts');
    expect(template?.files.length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import { t } from '@/lib/i18n';

describe('i18n helper', () => {
  it('returns translated values for known keys', () => {
    expect(t('toolbar.run')).toBe('Run');
    expect(t('tabs.repl')).toBe('REPL');
  });

  it('falls back to key when translation is missing', () => {
    expect(t('unknown.key')).toBe('unknown.key');
  });
});


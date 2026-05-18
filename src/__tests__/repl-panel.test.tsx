import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReplPanel from '@/components/layout/ReplPanel';

describe('ReplPanel', () => {
  it('unregisters stale external commands when registrations change', () => {
    const onEvaluate = vi.fn<(code: string, runtime: 'iframe' | 'detached' | 'auto') => void>();
    const evaluateSelection = vi.fn(() => '.hello');
    const { container, rerender } = render(
      <ReplPanel
        onEvaluate={onEvaluate}
        evaluateSelection={evaluateSelection}
        extraCommandRegistrations={[{ name: '.hello', handler: () => 'hello world' }]}
        runtime="auto"
        onRuntimeChange={() => undefined}
        autocompleteEnabled
      />,
    );

    fireEvent.click(screen.getByText('Evaluate Selection'));
    expect(container.textContent).toContain('hello world');

    rerender(
      <ReplPanel
        onEvaluate={onEvaluate}
        evaluateSelection={evaluateSelection}
        extraCommandRegistrations={[]}
        runtime="auto"
        onRuntimeChange={() => undefined}
        autocompleteEnabled
      />,
    );

    fireEvent.click(screen.getByText('Evaluate Selection'));
    expect(container.textContent).toContain('Unknown command: .hello');
  });
});

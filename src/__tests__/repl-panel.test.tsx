import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReplPanel from '@/components/layout/ReplPanel';

describe('ReplPanel', () => {
  it('unregisters stale external commands when registrations change', () => {
    const onEvaluate = vi.fn();
    const { container, rerender } = render(
      <ReplPanel
        onEvaluate={onEvaluate}
        extraCommandRegistrations={[{ name: '.hello', handler: () => 'hello world' }]}
      />,
    );

    const input = screen.getByPlaceholderText('Type JavaScript or .help');
    fireEvent.change(input, { target: { value: '.hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(container.textContent).toContain('hello world');

    rerender(<ReplPanel onEvaluate={onEvaluate} extraCommandRegistrations={[]} />);

    const nextInput = screen.getByPlaceholderText('Type JavaScript or .help');
    fireEvent.change(nextInput, { target: { value: '.hello' } });
    fireEvent.keyDown(nextInput, { key: 'Enter' });
    expect(container.textContent).toContain('Unknown command: .hello');
  });
});

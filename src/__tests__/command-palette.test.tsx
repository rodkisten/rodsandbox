import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CommandPalette from '@/components/ui/CommandPalette';

describe('CommandPalette', () => {
  it('renders commands when open', () => {
    render(
      <CommandPalette
        open
        onClose={vi.fn()}
        commands={[
          { id: 'run', label: 'Run', action: vi.fn() },
          { id: 'save', label: 'Save', action: vi.fn() },
        ]}
      />,
    );

    expect(screen.getByText('Run')).toBeTruthy();
    expect(screen.getByText('Save')).toBeTruthy();
  });

  it('filters by query', () => {
    render(
      <CommandPalette
        open
        onClose={vi.fn()}
        commands={[
          { id: 'run', label: 'Run Project', action: vi.fn() },
          { id: 'save', label: 'Save File', action: vi.fn() },
        ]}
      />,
    );

    const input = screen.getByPlaceholderText('Search commands...');
    fireEvent.change(input, { target: { value: 'save' } });
    expect(screen.queryByText('Run Project')).toBeNull();
    expect(screen.getByText('Save File')).toBeTruthy();
  });
});

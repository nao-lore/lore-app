/**
 * DropdownMenu.test.tsx — Snapshot + UI regression tests for DropdownMenu
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import DropdownMenu from '../DropdownMenu';

const options = [
  { key: 'a', label: 'Alpha' },
  { key: 'b', label: 'Beta' },
  { key: 'c', label: 'Gamma' },
];

/** Get the trigger button via its unique aria-haspopup attribute */
function getTrigger(container: HTMLElement) {
  return container.querySelector('[aria-haspopup="menu"]') as HTMLElement;
}

describe('DropdownMenu', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Snapshot tests ──

  it('matches snapshot when closed', () => {
    const { container } = render(
      <DropdownMenu label="Sort" value="a" options={options} onChange={vi.fn()} ariaLabel="Sort dropdown" />
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('matches snapshot when open', () => {
    const { container } = render(
      <DropdownMenu label="Sort" value="a" options={options} onChange={vi.fn()} ariaLabel="Sort dropdown" />
    );
    fireEvent.click(getTrigger(container));
    expect(container.innerHTML).toMatchSnapshot();
  });

  // ── UI regression tests ──

  it('renders the trigger button with label and current value', () => {
    const { container } = render(
      <DropdownMenu label="Sort" value="b" options={options} onChange={vi.fn()} ariaLabel="Sort dropdown" />
    );
    const button = getTrigger(container);
    expect(button.textContent).toContain('Sort');
    expect(button.textContent).toContain('Beta');
  });

  it('menu is initially hidden', () => {
    render(<DropdownMenu label="Sort" value="a" options={options} onChange={vi.fn()} ariaLabel="Sort dropdown" />);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens menu on button click', () => {
    const { container } = render(
      <DropdownMenu label="Sort" value="a" options={options} onChange={vi.fn()} ariaLabel="Sort dropdown" />
    );
    const button = getTrigger(container);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('shows all options when open', () => {
    const { container } = render(
      <DropdownMenu label="Sort" value="a" options={options} onChange={vi.fn()} ariaLabel="Sort dropdown" />
    );
    fireEvent.click(getTrigger(container));
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toBe('Alpha');
    expect(items[1].textContent).toBe('Beta');
    expect(items[2].textContent).toBe('Gamma');
  });

  it('highlights the active option', () => {
    const { container } = render(
      <DropdownMenu label="Sort" value="b" options={options} onChange={vi.fn()} ariaLabel="Sort dropdown" />
    );
    fireEvent.click(getTrigger(container));
    const items = screen.getAllByRole('menuitem');
    expect(items[1].className).toContain('active');
    expect(items[0].className).not.toContain('active');
  });

  it('calls onChange and closes menu on option click', () => {
    const onChange = vi.fn();
    const { container } = render(
      <DropdownMenu label="Sort" value="a" options={options} onChange={onChange} ariaLabel="Sort dropdown" />
    );
    fireEvent.click(getTrigger(container));
    const items = screen.getAllByRole('menuitem');
    fireEvent.click(items[2]); // click Gamma
    expect(onChange).toHaveBeenCalledWith('c');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes on Escape key', () => {
    const { container } = render(
      <DropdownMenu label="Sort" value="a" options={options} onChange={vi.fn()} ariaLabel="Sort dropdown" />
    );
    fireEvent.click(getTrigger(container));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes on outside click', () => {
    const { container } = render(
      <div>
        <span data-testid="outside">Outside</span>
        <DropdownMenu label="Sort" value="a" options={options} onChange={vi.fn()} ariaLabel="Sort dropdown" />
      </div>
    );
    fireEvent.click(getTrigger(container));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('toggles menu on repeated clicks', () => {
    const { container } = render(
      <DropdownMenu label="Sort" value="a" options={options} onChange={vi.fn()} ariaLabel="Sort dropdown" />
    );
    const button = getTrigger(container);
    fireEvent.click(button);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.click(button);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('passes ariaLabel to the trigger button', () => {
    const { container } = render(
      <DropdownMenu label="Sort" value="a" options={options} onChange={vi.fn()} ariaLabel="Sort options" />
    );
    expect(getTrigger(container)).toHaveAttribute('aria-label', 'Sort options');
  });

  it('has aria-haspopup="menu" on trigger', () => {
    const { container } = render(
      <DropdownMenu label="Sort" value="a" options={options} onChange={vi.fn()} ariaLabel="Sort dropdown" />
    );
    expect(getTrigger(container)).toHaveAttribute('aria-haspopup', 'menu');
  });
});

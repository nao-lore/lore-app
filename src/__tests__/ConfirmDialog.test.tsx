/**
 * ConfirmDialog.test.tsx — Snapshot + UI regression tests for ConfirmDialog
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Mock useFocusTrap to return a simple ref (jsdom doesn't support focus trapping fully)
vi.mock('../useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}));

import ConfirmDialog from '../ConfirmDialog';

const defaultProps = {
  title: 'Delete this item?',
  description: 'This action cannot be undone.',
  confirmLabel: 'Delete',
  cancelLabel: 'Cancel',
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

describe('ConfirmDialog', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    defaultProps.onConfirm = vi.fn();
    defaultProps.onCancel = vi.fn();
  });

  // ── Snapshot tests ──

  it('matches snapshot (danger mode)', () => {
    const { container } = render(<ConfirmDialog {...defaultProps} danger={true} />);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('matches snapshot (non-danger mode)', () => {
    const { container } = render(<ConfirmDialog {...defaultProps} danger={false} />);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('matches snapshot without description', () => {
    const { container } = render(
      <ConfirmDialog {...defaultProps} description={undefined} />
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  // ── UI regression tests ──

  it('renders with alertdialog role', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('renders title and description', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('Delete this item?')).toBeInTheDocument();
    expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
  });

  it('renders confirm and cancel buttons', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('Delete')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button clicked', () => {
    render(<ConfirmDialog {...defaultProps} />);
    fireEvent.click(screen.getByText('Delete'));
    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when cancel button clicked', () => {
    render(<ConfirmDialog {...defaultProps} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel on Escape key', () => {
    render(<ConfirmDialog {...defaultProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel on overlay click', () => {
    const { container } = render(<ConfirmDialog {...defaultProps} />);
    const overlay = container.querySelector('.modal-overlay');
    fireEvent.click(overlay!);
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not call onCancel when dialog body clicked (stopPropagation)', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(dialog);
    expect(defaultProps.onCancel).not.toHaveBeenCalled();
  });

  it('uses btn-danger class when danger=true', () => {
    render(<ConfirmDialog {...defaultProps} danger={true} />);
    const confirmBtn = screen.getByText('Delete');
    expect(confirmBtn.className).toContain('btn-danger');
  });

  it('uses btn-primary class when danger=false', () => {
    render(<ConfirmDialog {...defaultProps} danger={false} />);
    const confirmBtn = screen.getByText('Delete');
    expect(confirmBtn.className).toContain('btn-primary');
  });

  it('has aria-modal="true"', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByRole('alertdialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('has aria-labelledby pointing to title', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAttribute('aria-labelledby', 'confirm-dialog-title');
  });

  it('has aria-describedby when description is provided', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAttribute('aria-describedby', 'confirm-dialog-desc');
  });

  it('omits aria-describedby when no description', () => {
    render(<ConfirmDialog {...defaultProps} description={undefined} />);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).not.toHaveAttribute('aria-describedby');
  });
});

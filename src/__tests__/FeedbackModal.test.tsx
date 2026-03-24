/**
 * FeedbackModal.test.tsx — Snapshot + UI regression tests for FeedbackModal
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Mock useFocusTrap
vi.mock('../useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}));

import FeedbackModal from '../FeedbackModal';

describe('FeedbackModal', () => {
  let onClose: ReturnType<typeof vi.fn>;

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    onClose = vi.fn();
    // Mock window.open
    vi.stubGlobal('open', vi.fn());
    // Mock clipboard
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  // ── Snapshot tests ──

  it('matches snapshot in initial state', () => {
    const { container } = render(<FeedbackModal lang="en" onClose={onClose} />);
    expect(container.innerHTML).toMatchSnapshot();
  });

  // ── UI regression tests ──

  it('renders the feedback dialog', () => {
    render(<FeedbackModal lang="en" onClose={onClose} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows category buttons', () => {
    render(<FeedbackModal lang="en" onClose={onClose} />);
    expect(screen.getByText('Bug Report')).toBeInTheDocument();
    expect(screen.getByText('Feature Request')).toBeInTheDocument();
    expect(screen.getByText('UX / Usability')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
  });

  it('shows textarea for description', () => {
    render(<FeedbackModal lang="en" onClose={onClose} />);
    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeInTheDocument();
    expect(textarea.tagName).toBe('TEXTAREA');
  });

  it('submit button is disabled when textarea is empty', () => {
    render(<FeedbackModal lang="en" onClose={onClose} />);
    const buttons = screen.getAllByRole('button');
    const submitBtn = buttons.find(b => b.className.includes('btn-primary') && b.className.includes('btn-md-action'));
    expect(submitBtn).toHaveAttribute('disabled');
  });

  it('submit button is enabled after typing', () => {
    render(<FeedbackModal lang="en" onClose={onClose} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'This is a bug' } });
    const buttons = screen.getAllByRole('button');
    const submitBtn = buttons.find(b => b.className.includes('btn-primary') && b.className.includes('btn-md-action'));
    expect(submitBtn).not.toHaveAttribute('disabled');
  });

  it('clicking submit opens a new window with GitHub issue URL', () => {
    render(<FeedbackModal lang="en" onClose={onClose} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Some feedback text' } });
    const buttons = screen.getAllByRole('button');
    const submitBtn = buttons.find(b => b.className.includes('btn-primary') && b.className.includes('btn-md-action'));
    fireEvent.click(submitBtn!);
    expect(window.open).toHaveBeenCalledTimes(1);
    const url = (window.open as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('github.com');
    expect(url).toContain('issues/new');
  });

  it('shows thank you message after submit', () => {
    render(<FeedbackModal lang="en" onClose={onClose} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Some feedback' } });
    const buttons = screen.getAllByRole('button');
    const submitBtn = buttons.find(b => b.className.includes('btn-primary') && b.className.includes('btn-md-action'));
    fireEvent.click(submitBtn!);
    // After submit, the textarea should be replaced by a thank you message
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('switching category changes active button', () => {
    render(<FeedbackModal lang="en" onClose={onClose} />);
    const featureBtn = screen.getByText('Feature Request');
    fireEvent.click(featureBtn);
    expect(featureBtn.className).toContain('active');
  });

  it('calls onClose on overlay click', () => {
    const { container } = render(<FeedbackModal lang="en" onClose={onClose} />);
    const overlay = container.querySelector('.modal-overlay');
    fireEvent.click(overlay!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on Escape key', () => {
    render(<FeedbackModal lang="en" onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when dialog body clicked', () => {
    render(<FeedbackModal lang="en" onClose={onClose} />);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('close button calls onClose', () => {
    render(<FeedbackModal lang="en" onClose={onClose} />);
    // The X close button has an aria-label
    const closeBtn = screen.getAllByRole('button').find(b => b.getAttribute('aria-label')?.toLowerCase().includes('close'));
    expect(closeBtn).toBeTruthy();
    fireEvent.click(closeBtn!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('copy button copies text to clipboard', () => {
    render(<FeedbackModal lang="en" onClose={onClose} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Copy me' } });
    const buttons = screen.getAllByRole('button');
    const copyBtn = buttons.find(b => b.className.includes('btn-nav-sm'));
    fireEvent.click(copyBtn!);
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });
});

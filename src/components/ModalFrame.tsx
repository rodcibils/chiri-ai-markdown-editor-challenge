import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

interface ModalFrameProps {
  titleId: string;
  kicker: string;
  title: string;
  closeLabel: string;
  className?: string;
  children: ReactNode;
  onClose: () => void;
}

const focusableSelector = [
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Provides shared dialog structure, focus trapping, and keyboard dismissal. */
export function ModalFrame({
  titleId,
  kicker,
  title,
  closeLabel,
  className = '',
  children,
  onClose,
}: ModalFrameProps) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const dialog = dialogRef.current;
    const preferred = dialog?.querySelector<HTMLElement>(
      '[data-modal-initial-focus]:not([disabled])',
    );
    const firstFocusable = dialog?.querySelector<HTMLElement>(focusableSelector);

    (preferred ?? firstFocusable)?.focus({ preventScroll: true });

    return () => {
      if (previouslyFocused instanceof HTMLElement) {
        // App restores the exact editor range; this only restores focus ownership.
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, []);

  /** Keeps keyboard focus inside the dialog and supports Escape dismissal. */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== 'Tab' || !dialogRef.current) return;

    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector),
    );
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className={`ai-modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
      >
        <div className="modal-header">
          <div>
            <span className="modal-kicker">{kicker}</span>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button
            type="button"
            className="close-button"
            onClick={onClose}
            aria-label={closeLabel}
          >
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

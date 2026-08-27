import { ModalFrame } from './ModalFrame';

interface HelpModalProps {
  onClose: () => void;
}

/** Explains the contextual AI workflow without changing editor or AI state. */
export function HelpModal({ onClose }: HelpModalProps) {
  return (
    <ModalFrame
      titleId="help-modal-title"
      kicker="EDITOR HELP"
      title="How AI suggestions work"
      closeLabel="Close editor help"
      className="help-modal"
      onClose={onClose}
    >
      <div className="modal-body help-body">
        <ol className="help-steps">
          <li>
            <strong>Continue writing</strong>
            <span>
              Leave the cursor where you want new text, pause briefly, then
              press the lightbulb.
            </span>
          </li>
          <li>
            <strong>Improve text</strong>
            <span>
              Select the Markdown you want to revise, then press the lightbulb
              beside the end of your selection.
            </span>
          </li>
          <li>
            <strong>Change everything</strong>
            <span>
              Focus the raw editor and press <kbd>Ctrl+A</kbd> or{' '}
              <kbd>Command+A</kbd>, then use the selection lightbulb.
            </span>
          </li>
          <li>
            <strong>Review safely</strong>
            <span>
              Compare both versions, then Accept, Reject, or Refine before the
              document changes.
            </span>
          </li>
        </ol>

        <div className="modal-actions help-actions">
          <button type="button" data-modal-initial-focus onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}

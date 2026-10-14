import { KeyRound } from 'lucide-react';

import { IconButton } from '@/shared/ui/icon-button';

export interface ApiKeysButtonProps {
  /** Opens the API keys dialog, whose open state the page owns. */
  onClick: () => void;
}

/**
 * The header button that opens the API keys dialog (`ApiKeysDialog`).
 *
 * It takes focus before it opens the dialog: Safari, and Firefox on macOS, leave a clicked button
 * unfocused, and the dialog gives focus back to whatever had it when it opened.
 */
export function ApiKeysButton({ onClick }: ApiKeysButtonProps) {
  return (
    <IconButton
      label="API keys"
      aria-haspopup="dialog"
      onClick={(event) => {
        event.currentTarget.focus();
        onClick();
      }}
    >
      <KeyRound aria-hidden />
    </IconButton>
  );
}

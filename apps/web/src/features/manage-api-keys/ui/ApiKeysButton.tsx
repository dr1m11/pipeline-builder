import { KeyRound } from 'lucide-react';

import { IconButton } from '@/shared/ui/icon-button';

export interface ApiKeysButtonProps {
  /** Opens the API keys dialog, whose open state the page owns. */
  onClick: () => void;
}

/** The header button that opens the API keys dialog (`ApiKeysDialog`). */
export function ApiKeysButton({ onClick }: ApiKeysButtonProps) {
  return (
    <IconButton label="API keys" aria-haspopup="dialog" onClick={onClick}>
      <KeyRound aria-hidden />
    </IconButton>
  );
}

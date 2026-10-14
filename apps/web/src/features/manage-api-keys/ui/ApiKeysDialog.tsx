import { LLM_PROVIDER_INFO, type LlmProvider } from '@pipeline-builder/core';
import { Eye, EyeOff, Trash2 } from 'lucide-react';
import { type SubmitEvent, useCallback, useId, useRef, useState } from 'react';

import {
  API_KEY_PROVIDERS,
  clearApiKey,
  getApiKey,
  isApiKeyRemembered,
  saveApiKey,
  useApiKey,
} from '@/entities/api-key';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { IconButton } from '@/shared/ui/icon-button';
import { Input } from '@/shared/ui/input';
import { useToast } from '@/shared/ui/toast';

export interface ApiKeysDialogProps {
  /** Whether the dialog is open. The page owns it, so that a run can ask for a missing key. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Provider whose field takes focus when the dialog opens; the first field does otherwise. */
  provider?: LlmProvider | undefined;
}

/**
 * The API keys dialog: a password field for each provider that runs with the user's key, a choice
 * to remember the keys on this device, Save, and a Clear button per key. The fields start with the
 * saved keys, hidden, every time the dialog opens; Save stores them all (an empty field clears its
 * key) and closes the dialog, Clear forgets one key at once.
 *
 * Closed, the dialog gives focus back to the element that had it when the dialog opened, such as
 * the button that opened it.
 */
export function ApiKeysDialog({ open, onOpenChange, provider }: ApiKeysDialogProps) {
  const baseId = useId();
  const fieldId = (fieldProvider: LlmProvider) => `${baseId}-${fieldProvider}`;
  const returnFocusRef = useRef<HTMLElement | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="API keys"
        description="Your keys stay in this browser. They are sent only to this app’s own proxy and never stored on the server."
        // Runs before focus moves into the dialog, so the focused element is the one left behind.
        onOpenAutoFocus={(event) => {
          const focused = document.activeElement;
          returnFocusRef.current =
            focused instanceof HTMLElement && focused !== document.body ? focused : null;
          const field = provider === undefined ? null : document.getElementById(fieldId(provider));
          if (field === null) return;
          event.preventDefault();
          field.focus();
        }}
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef.current;
          returnFocusRef.current = null;
          if (!target?.isConnected) return;
          event.preventDefault();
          target.focus({ preventScroll: true });
        }}
      >
        <ApiKeysForm
          fieldId={fieldId}
          onSaved={() => {
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

interface ApiKeysFormProps {
  fieldId: (provider: LlmProvider) => string;
  onSaved: () => void;
}

/** The fields of the dialog. It mounts each time the dialog opens, so it starts from the saved keys. */
function ApiKeysForm({ fieldId, onSaved }: ApiKeysFormProps) {
  const { toast } = useToast();
  // The key fields are uncontrolled (see `ApiKeyField`): their values are read from the elements.
  const inputsRef = useRef(new Map<LlmProvider, HTMLInputElement>());
  const [remember, setRemember] = useState(() => API_KEY_PROVIDERS.some(isApiKeyRemembered));
  const [status, setStatus] = useState('');
  const rememberId = useId();
  const rememberHintId = useId();

  const registerInput = useCallback((provider: LlmProvider, input: HTMLInputElement) => {
    inputsRef.current.set(provider, input);
    return () => {
      inputsRef.current.delete(provider);
    };
  }, []);

  const save = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const kept = API_KEY_PROVIDERS.map((provider) =>
      saveApiKey(provider, inputsRef.current.get(provider)?.value ?? '', { remember }),
    );
    if (kept.includes('page')) {
      toast({
        title: 'API keys kept until the page reloads',
        description: 'This browser doesn’t let the app store them.',
        tone: 'neutral',
      });
    }
    onSaved();
  };

  const clear = (provider: LlmProvider) => {
    clearApiKey(provider);
    setStatus(`${LLM_PROVIDER_INFO[provider].title} key cleared.`);
    const input = inputsRef.current.get(provider);
    if (input === undefined) return;
    input.value = '';
    // The Clear button is disabled now: the field is where a new key goes.
    input.focus();
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={save}>
      {API_KEY_PROVIDERS.map((provider) => (
        <ApiKeyField
          key={provider}
          id={fieldId(provider)}
          provider={provider}
          registerInput={registerInput}
          onClear={() => {
            clear(provider);
          }}
        />
      ))}
      <div className="flex items-start gap-2">
        <Checkbox
          id={rememberId}
          checked={remember}
          onCheckedChange={(checked) => {
            setRemember(checked === true);
          }}
          aria-describedby={rememberHintId}
          className="mt-0.5"
        />
        <div className="flex flex-col gap-0.5">
          <label htmlFor={rememberId} className="text-sm font-medium">
            Remember on this device
          </label>
          <p id={rememberHintId} className="text-xs text-fg-muted">
            Keeps the keys after this tab is closed. Leave it off on a shared computer.
          </p>
        </div>
      </div>
      <p role="status" className="sr-only">
        {status}
      </p>
      <div className="flex justify-end">
        <Button type="submit" variant="primary">
          Save
        </Button>
      </div>
    </form>
  );
}

interface ApiKeyFieldProps {
  id: string;
  provider: LlmProvider;
  /** Hands the form the field's element; returns a function that takes it back. */
  registerInput: (provider: LlmProvider, input: HTMLInputElement) => () => void;
  onClear: () => void;
}

/**
 * The key of one provider: a password field named after the provider, Show or Hide, and Clear.
 *
 * The field is uncontrolled, and the saved key goes in through the `value` property: React mirrors
 * a `value` or `defaultValue` prop into the `value` attribute, which would leave the key in the DOM
 * for anything that reads or serializes the page.
 */
function ApiKeyField({ id, provider, registerInput, onClear }: ApiKeyFieldProps) {
  const { title } = LLM_PROVIDER_INFO[provider];
  const saved = useApiKey(provider) !== null;
  const [visible, setVisible] = useState(false);
  // Stable, so that it runs when the field mounts rather than on every render.
  const attachInput = useCallback(
    (input: HTMLInputElement | null) => {
      if (input === null) return;
      input.value = getApiKey(provider) ?? '';
      return registerInput(provider, input);
    },
    [provider, registerInput],
  );

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {title}
      </label>
      <div className="flex items-center gap-1">
        <div className="relative flex-1">
          <Input
            ref={attachInput}
            id={id}
            type={visible ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            // Asks password managers (1Password, LastPass, Bitwarden, Dashlane, in that order) to
            // neither offer to save the key as this site's password nor fill a password in.
            data-1p-ignore=""
            data-lpignore="true"
            data-bwignore=""
            data-form-type="other"
            className="pr-9 font-mono"
          />
          <IconButton
            label={`${visible ? 'Hide' : 'Show'} ${title} key`}
            onClick={() => {
              setVisible((current) => !current);
            }}
            className="absolute top-0 right-0"
          >
            {visible ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          </IconButton>
        </div>
        <IconButton label={`Clear ${title} key`} disabled={!saved} onClick={onClear}>
          <Trash2 aria-hidden />
        </IconButton>
      </div>
    </div>
  );
}

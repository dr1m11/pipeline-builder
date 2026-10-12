import { Button } from '@/shared/ui/button';

export interface ErrorFallbackProps {
  error: unknown;
  onRetry: () => void;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

/** Full-screen message shown when rendering fails. */
export function ErrorFallback({ error, onRetry }: ErrorFallbackProps) {
  return (
    <div
      role="alert"
      className="mx-auto grid min-h-full max-w-xl place-content-center gap-3 p-6 text-center"
    >
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-fg-muted">
        The editor hit an unexpected error. Your autosaved work is safe.
      </p>
      <pre className="overflow-auto rounded-lg bg-surface-muted p-3 text-left text-sm whitespace-pre-wrap">
        {describeError(error)}
      </pre>
      <div>
        <Button variant="primary" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  );
}

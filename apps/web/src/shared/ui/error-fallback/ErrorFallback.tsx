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
    <div role="alert" className="screen-message">
      <h1>Something went wrong</h1>
      <p>The editor hit an unexpected error. Your autosaved work is safe.</p>
      <pre className="screen-message__details">{describeError(error)}</pre>
      <button type="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

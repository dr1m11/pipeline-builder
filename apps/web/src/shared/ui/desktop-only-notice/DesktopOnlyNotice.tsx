import { DESKTOP_MIN_WIDTH } from '@/shared/config';

/** Placeholder for viewports narrower than the editor supports. */
export function DesktopOnlyNotice() {
  return (
    <main className="mx-auto grid min-h-full max-w-xl place-content-center gap-3 p-6 text-center">
      <h1 className="text-2xl font-semibold">Pipeline Builder needs a larger screen</h1>
      <p className="text-fg-muted">
        The editor is designed for desktop browsers at least {DESKTOP_MIN_WIDTH}px wide. Open this
        page on a laptop or desktop to build and run pipelines.
      </p>
    </main>
  );
}

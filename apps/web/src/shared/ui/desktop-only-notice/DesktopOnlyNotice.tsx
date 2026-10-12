import { DESKTOP_MIN_WIDTH } from '@/shared/config';

/** Placeholder for viewports narrower than the editor supports. */
export function DesktopOnlyNotice() {
  return (
    <main className="screen-message">
      <h1>Pipeline Builder needs a larger screen</h1>
      <p>
        The editor is designed for desktop browsers at least {DESKTOP_MIN_WIDTH}px wide. Open this
        page on a laptop or desktop to build and run pipelines.
      </p>
    </main>
  );
}

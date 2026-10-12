import { EditorPage } from '@/pages/editor';

import { DesktopOnlyGate } from './device-support';
import { AppErrorBoundary } from './error-handling';
import { ThemeSync } from './theme';

export function App() {
  return (
    <AppErrorBoundary>
      <ThemeSync />
      <DesktopOnlyGate>
        <EditorPage />
      </DesktopOnlyGate>
    </AppErrorBoundary>
  );
}

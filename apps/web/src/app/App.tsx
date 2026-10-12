import { EditorPage } from '@/pages/editor';

import { DesktopOnlyGate } from './device-support';
import { AppErrorBoundary } from './error-handling';

export function App() {
  return (
    <AppErrorBoundary>
      <DesktopOnlyGate>
        <EditorPage />
      </DesktopOnlyGate>
    </AppErrorBoundary>
  );
}

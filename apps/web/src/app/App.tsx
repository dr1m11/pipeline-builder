import { EditorPage } from '@/pages/editor';
import { TooltipProvider } from '@/shared/ui/tooltip';

import { DesktopOnlyGate } from './device-support';
import { AppErrorBoundary } from './error-handling';
import { ThemeSync } from './theme';

export function App() {
  return (
    <AppErrorBoundary>
      <ThemeSync />
      <TooltipProvider>
        <DesktopOnlyGate>
          <EditorPage />
        </DesktopOnlyGate>
      </TooltipProvider>
    </AppErrorBoundary>
  );
}

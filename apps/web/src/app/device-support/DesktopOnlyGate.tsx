import type { ReactNode } from 'react';

import { DESKTOP_MEDIA_QUERY } from '@/shared/config';
import { useMediaQuery } from '@/shared/lib/media';
import { DesktopOnlyNotice } from '@/shared/ui/desktop-only-notice';

/** The editor is desktop-only; smaller screens get an explanatory placeholder. */
export function DesktopOnlyGate({ children }: { children: ReactNode }) {
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);
  return isDesktop ? children : <DesktopOnlyNotice />;
}

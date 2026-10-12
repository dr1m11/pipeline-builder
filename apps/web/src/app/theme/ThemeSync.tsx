import { useTheme } from '@/shared/lib/theme';

/** Keeps `<html data-theme>` in sync with the stored preference and OS changes for the whole app. */
export function ThemeSync() {
  useTheme();
  return null;
}

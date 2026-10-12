import { THEME_PREFERENCES, type ThemePreference, useTheme } from '@/shared/lib/theme';

const LABELS: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

/** Segmented control for the colour theme; native radios keep it keyboard- and screen-reader-friendly. */
export function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  return (
    <fieldset className="inline-flex rounded-lg border border-border bg-surface-muted p-0.5 text-sm">
      <legend className="sr-only">Colour theme</legend>
      {THEME_PREFERENCES.map((option) => (
        <label
          key={option}
          className="cursor-pointer rounded-md px-2.5 py-1 text-fg-muted transition-colors select-none hover:text-fg has-checked:bg-surface has-checked:text-fg has-checked:shadow-elevated has-focus-visible:outline-2 has-focus-visible:outline-focus"
        >
          <input
            type="radio"
            name="colour-theme"
            value={option}
            checked={preference === option}
            onChange={() => {
              setPreference(option);
            }}
            className="sr-only"
          />
          {LABELS[option]}
        </label>
      ))}
    </fieldset>
  );
}

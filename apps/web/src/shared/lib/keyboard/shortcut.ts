// A shortcut is written as modifiers and a key joined by `+`: 'Mod+Z', 'Mod+Shift+Z', 'Ctrl+Y',
// '?', 'Escape'. `Mod` is ⌘ on Apple platforms and Ctrl elsewhere; `Ctrl`, `Meta`, `Alt` and
// `Shift` mean the same key everywhere. The key is a character or a `KeyboardEvent.key` name. A
// shortcut that is only listed in the help may name a gesture or a set of keys instead, shown as
// written: 'Shift+Drag', 'Mod+Click', 'Arrow keys'.

/** A shortcut of the app, described for the keyboard shortcuts help. */
export interface ShortcutDescriptor {
  /** Stable id, e.g. 'undo'. */
  readonly id: string;
  /** Shortcuts that trigger it, the main one first: ['Mod+Shift+Z', 'Ctrl+Y']. */
  readonly keys: readonly string[];
  /** Shortcuts on Apple platforms, when they differ from `keys`. */
  readonly appleKeys?: readonly string[];
  /** What it does: 'Undo'. */
  readonly label: string;
  /** The section of the help it is listed in: 'Edit'. */
  readonly group: string;
}

/** The parts of a keyboard event that a shortcut is matched against. */
export type ShortcutEvent = Pick<
  KeyboardEvent,
  'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'
>;

type Modifier = 'Mod' | 'Ctrl' | 'Meta' | 'Alt' | 'Shift';

const MODIFIERS: readonly Modifier[] = ['Mod', 'Ctrl', 'Meta', 'Alt', 'Shift'];

const APPLE_MODIFIERS: Record<Modifier, string> = {
  Mod: '⌘',
  Ctrl: '⌃',
  Meta: '⌘',
  Alt: '⌥',
  Shift: '⇧',
};

const OTHER_MODIFIERS: Record<Modifier, string> = {
  Mod: 'Ctrl',
  Ctrl: 'Ctrl',
  Meta: 'Meta',
  Alt: 'Alt',
  Shift: 'Shift',
};

const KEY_NAMES: Readonly<Record<string, string>> = {
  Escape: 'Esc',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  ' ': 'Space',
};

/** The shortcuts of `shortcut` on this platform. */
export function shortcutKeys(
  shortcut: Pick<ShortcutDescriptor, 'keys' | 'appleKeys'>,
  apple: boolean,
): readonly string[] {
  return apple ? (shortcut.appleKeys ?? shortcut.keys) : shortcut.keys;
}

/**
 * Whether `event` presses `shortcut`. Modifiers must match exactly, so 'Mod+Z' does not match
 * Mod+Shift+Z; only Shift is ignored for a symbol such as '?', which may need Shift to be typed.
 * Keys are compared without case. A letter or digit of a non-Latin layout (Cyrillic 'я' on the Z
 * key) is matched by the key's place on the keyboard instead, so shortcuts work on any layout.
 */
export function matchesShortcut(event: ShortcutEvent, shortcut: string, apple: boolean): boolean {
  const { modifiers, key } = parseShortcut(shortcut);
  const has = (modifier: Modifier) => modifiers.includes(modifier);
  const ctrl = has('Ctrl') || (has('Mod') && !apple);
  const meta = has('Meta') || (has('Mod') && apple);
  return (
    event.ctrlKey === ctrl &&
    event.metaKey === meta &&
    event.altKey === has('Alt') &&
    (isSymbol(key) || event.shiftKey === has('Shift')) &&
    pressedKey(event) === key.toLowerCase()
  );
}

/**
 * The keys of `shortcut` as they are shown, one per `Kbd`: ['⌘', '⇧', 'Z'] on Apple platforms,
 * ['Ctrl', 'Shift', 'Z'] elsewhere.
 */
export function formatShortcut(shortcut: string, apple: boolean): readonly string[] {
  const { modifiers, key } = parseShortcut(shortcut);
  const names = apple ? APPLE_MODIFIERS : OTHER_MODIFIERS;
  const keyName = KEY_NAMES[key] ?? (key.length === 1 ? key.toUpperCase() : key);
  return [...modifiers.map((modifier) => names[modifier]), keyName];
}

/** Splits a shortcut into its modifiers and key; an unknown modifier is a programming error. */
function parseShortcut(shortcut: string): { modifiers: readonly Modifier[]; key: string } {
  const parts = shortcut.split('+');
  const key = parts.at(-1) ?? '';
  const modifiers = parts.slice(0, -1).map((part) => {
    const modifier = MODIFIERS.find((candidate) => candidate === part);
    if (modifier === undefined) throw new Error(`Unknown modifier "${part}" in "${shortcut}"`);
    return modifier;
  });
  return { modifiers, key };
}

/** A single character that is neither a letter nor a digit, such as '?' or '/'. */
function isSymbol(key: string): boolean {
  return key.length === 1 && !/[\p{L}\p{N}]/u.test(key);
}

/**
 * The pressed key in lower case. When it is not ASCII (a non-Latin layout), a letter or digit key
 * is named by its place on a US keyboard (`KeyZ` → 'z').
 */
function pressedKey(event: ShortcutEvent): string {
  const key = event.key.toLowerCase();
  if (/^[ -~]+$/.test(key)) return key;
  const place = /^(?:Key|Digit)(.)$/.exec(event.code)?.[1];
  return place === undefined ? key : place.toLowerCase();
}

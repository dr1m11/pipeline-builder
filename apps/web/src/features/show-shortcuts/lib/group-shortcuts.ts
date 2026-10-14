import type { ShortcutDescriptor } from '@/shared/lib/keyboard';

/** A section of the keyboard shortcuts help. */
export interface ShortcutGroup {
  /** The `group` of its shortcuts: 'Edit'. */
  readonly name: string;
  readonly shortcuts: readonly ShortcutDescriptor[];
}

/**
 * Sorts shortcuts into their groups. Groups come in the order they first appear, and shortcuts keep
 * their order within a group.
 */
export function groupShortcuts(shortcuts: readonly ShortcutDescriptor[]): ShortcutGroup[] {
  const groups = new Map<string, ShortcutDescriptor[]>();
  for (const shortcut of shortcuts) {
    const group = groups.get(shortcut.group);
    if (group === undefined) groups.set(shortcut.group, [shortcut]);
    else group.push(shortcut);
  }
  return Array.from(groups, ([name, grouped]) => ({ name, shortcuts: grouped }));
}

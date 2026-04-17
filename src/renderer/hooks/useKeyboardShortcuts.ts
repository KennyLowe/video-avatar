import { useEffect } from 'react';

// Global single-keystroke navigation per FR-057. Each call registers a handler
// for the key combination `modifier + key` on window-level keydown; the last
// component to call for a given combination wins, matching React's usual
// stacking order.

export interface Shortcut {
  /** Platform-independent — treats Ctrl and Cmd as the same gate. */
  combo: string;
  handler: (event: KeyboardEvent) => void;
}

export function useKeyboardShortcuts(shortcuts: readonly Shortcut[]): void {
  useEffect(() => {
    const byCombo = new Map<string, (event: KeyboardEvent) => void>();
    for (const s of shortcuts) byCombo.set(normaliseCombo(s.combo), s.handler);

    const onKeyDown = (event: KeyboardEvent) => {
      const key = describeEvent(event);
      const handler = byCombo.get(key);
      if (!handler) return;
      event.preventDefault();
      handler(event);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shortcuts]);
}

function describeEvent(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('mod');
  if (event.shiftKey) parts.push('shift');
  if (event.altKey) parts.push('alt');
  parts.push(event.key.toLowerCase());
  return parts.join('+');
}

function normaliseCombo(combo: string): string {
  return combo
    .toLowerCase()
    .split('+')
    .map((part) => (part === 'ctrl' || part === 'cmd' ? 'mod' : part))
    .map((part) => (part === ',' ? ',' : part))
    .join('+');
}

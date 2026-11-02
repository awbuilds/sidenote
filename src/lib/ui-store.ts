/**
 * Tiny UI store for the command palette, so the mobile tab bar (and anything
 * else) can open it without knowing how it is mounted.
 */
let open = false;
const listeners = new Set<() => void>();

export function setCommandPaletteOpen(value: boolean): void {
  if (open === value) return;
  open = value;
  for (const listener of listeners) listener();
}

export function toggleCommandPalette(): void {
  setCommandPaletteOpen(!open);
}

export function subscribeCommandPalette(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCommandPaletteOpen(): boolean {
  return open;
}

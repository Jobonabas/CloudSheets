import { useMemo, useSyncExternalStore } from 'react';
import type { Awareness } from 'y-protocols/awareness';

/**
 * Presence of the other editors, carried by Yjs' awareness protocol and not by the
 * document: awareness states are ephemeral, never reach sheets.yjs_snapshot and are
 * dropped when a client disconnects.
 *
 * Every client publishes two fields:
 *
 *   user  { name, colorIndex }
 *   cell  { rowId, columnKey }   - or null
 */

/** Size of the palette. Has to match --presence-0..N in index.css. */
export const PRESENCE_COLOR_COUNT = 6;

const USER_FIELD = 'user';
const CELL_FIELD = 'cell';

export interface CellPosition {
  rowId: string;
  columnKey: string;
}

export interface PresenceUser {
  name: string;
  colorIndex: number;
}

export interface Collaborator {
  clientId: number;
  user: PresenceUser;
  cell: CellPosition | null;
}

/**
 * Colour derived from the client ID, so every peer computes the same colour for the
 * same client without transmitting it.
 */
export function presenceColorIndex(clientId: number): number {
  return Math.abs(clientId) % PRESENCE_COLOR_COUNT;
}

/** Short display name: an email address is cut at the '@'. */
export function displayName(email: string | undefined, userId: string | undefined): string {
  const source = email ?? userId;
  if (!source) return 'Unbekannt';
  const at = source.indexOf('@');
  return at > 0 ? source.slice(0, at) : source;
}

/** Publishes the local user. Called once when the connection is set up. */
export function publishUser(awareness: Awareness, name: string): void {
  awareness.setLocalStateField(USER_FIELD, {
    name,
    colorIndex: presenceColorIndex(awareness.clientID),
  } satisfies PresenceUser);
}

/** Publishes the local cursor. null when the grid loses focus. */
export function publishCell(awareness: Awareness | null, cell: CellPosition | null): void {
  awareness?.setLocalStateField(CELL_FIELD, cell);
}

// --- Reading ---------------------------------------------------------------

function readCollaborators(awareness: Awareness): Collaborator[] {
  const result: Collaborator[] = [];

  awareness.getStates().forEach((state, clientId) => {
    if (clientId === awareness.clientID) return;

    const user = state[USER_FIELD] as PresenceUser | undefined;
    // A state without a user is a client that is still connecting.
    if (!user?.name) return;

    result.push({
      clientId,
      user,
      cell: (state[CELL_FIELD] as CellPosition | null | undefined) ?? null,
    });
  });

  // Sorted by client ID so the list does not reorder on every movement.
  return result.sort((a, b) => a.clientId - b.clientId);
}

interface PresenceStore {
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => Collaborator[];
}

/** Shared empty result, so the snapshot identity stays stable without a provider. */
const NO_COLLABORATORS: Collaborator[] = [];

function createPresenceStore(awareness: Awareness | null): PresenceStore {
  if (!awareness) {
    return { subscribe: () => () => {}, getSnapshot: () => NO_COLLABORATORS };
  }

  const listeners = new Set<() => void>();
  let snapshot = readCollaborators(awareness);

  const handleChange = () => {
    snapshot = readCollaborators(awareness);
    for (const listener of listeners) listener();
  };

  return {
    subscribe: (onStoreChange) => {
      if (listeners.size === 0) {
        awareness.on('change', handleChange);
        // Someone may have joined between store creation and this subscription.
        snapshot = readCollaborators(awareness);
      }
      listeners.add(onStoreChange);

      return () => {
        listeners.delete(onStoreChange);
        if (listeners.size === 0) awareness.off('change', handleChange);
      };
    },
    getSnapshot: () => snapshot,
  };
}

/** The other editors, excluding the local one. */
export function useCollaborators(awareness: Awareness | null): Collaborator[] {
  const store = useMemo(() => createPresenceStore(awareness), [awareness]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export function cellKey(rowId: string, columnKey: string): string {
  return `${rowId}|${columnKey}`;
}

/**
 * Cell -> the editor sitting on it. On a shared cell the lower client ID wins:
 * arbitrary, but stable, so the displayed name does not flicker.
 */
export function buildCursorMap(collaborators: Collaborator[]): Map<string, Collaborator> {
  const map = new Map<string, Collaborator>();
  for (const collaborator of collaborators) {
    if (!collaborator.cell) continue;
    const key = cellKey(collaborator.cell.rowId, collaborator.cell.columnKey);
    if (!map.has(key)) map.set(key, collaborator);
  }
  return map;
}

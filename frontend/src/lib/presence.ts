import { useMemo, useSyncExternalStore } from 'react';
import type { Awareness } from 'y-protocols/awareness';

/**
 * Anwesenheit der anderen Bearbeiter.
 *
 * Das laeuft ueber Yjs' Awareness-Protokoll und bewusst nicht ueber das Dokument:
 * Awareness-Zustaende sind fluechtig, werden nicht in sheets.yjs_snapshot
 * gespeichert und verschwinden von selbst, sobald jemand die Verbindung verliert.
 * Genau das will man fuer Cursor - eine Zellmarkierung, die nach einem Absturz
 * fuer immer stehen bliebe, waere schlimmer als gar keine.
 *
 * Jeder Client meldet zwei Felder:
 *
 *   user  { name, colorIndex }   - wer, und in welcher Farbe
 *   cell  { rowId, columnKey }   - wo der Cursor steht, oder null
 */

/** Zahl der Farben in der Palette. Muss zu --presence-0..N in index.css passen. */
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

/** Ein anderer Bearbeiter, so wie ihn diese Sitzung sieht. */
export interface Collaborator {
  clientId: number;
  user: PresenceUser;
  cell: CellPosition | null;
}

/**
 * Farbe aus der Client-ID ableiten statt zufaellig zu ziehen.
 *
 * Die Client-ID vergibt Yjs pro Dokument und Tab. Alle Beteiligten rechnen damit
 * dieselbe Farbe fuer denselben Client aus, ohne sie uebertragen zu muessen, und
 * sie bleibt ueber die ganze Sitzung stabil.
 */
export function presenceColorIndex(clientId: number): number {
  return Math.abs(clientId) % PRESENCE_COLOR_COUNT;
}

/**
 * Kurzer Anzeigename. Aus einer Mailadresse wird der Teil vor dem @ - in einer
 * Zellmarkierung ist "demo" lesbar, "demo@example.com" nicht.
 */
export function displayName(email: string | undefined, userId: string | undefined): string {
  const source = email ?? userId;
  if (!source) return 'Unbekannt';
  const at = source.indexOf('@');
  return at > 0 ? source.slice(0, at) : source;
}

/** Meldet, wer man ist. Einmal beim Aufbau der Verbindung. */
export function publishUser(awareness: Awareness, name: string): void {
  awareness.setLocalStateField(USER_FIELD, {
    name,
    colorIndex: presenceColorIndex(awareness.clientID),
  } satisfies PresenceUser);
}

/** Meldet, wo der eigene Cursor steht. null, wenn die Tabelle den Fokus verliert. */
export function publishCell(awareness: Awareness | null, cell: CellPosition | null): void {
  awareness?.setLocalStateField(CELL_FIELD, cell);
}

// --- Lesen -----------------------------------------------------------------

function readCollaborators(awareness: Awareness): Collaborator[] {
  const result: Collaborator[] = [];

  awareness.getStates().forEach((state, clientId) => {
    // Der eigene Cursor wird nicht gezeichnet - man sieht ja, wo man selbst steht.
    if (clientId === awareness.clientID) return;

    const user = state[USER_FIELD] as PresenceUser | undefined;
    // Ein Zustand ohne Nutzerangabe ist ein Client, der sich gerade erst verbindet.
    if (!user?.name) return;

    result.push({
      clientId,
      user,
      cell: (state[CELL_FIELD] as CellPosition | null | undefined) ?? null,
    });
  });

  // Nach Client-ID sortiert, damit die Liste nicht bei jeder Bewegung umspringt.
  return result.sort((a, b) => a.clientId - b.clientId);
}

interface PresenceStore {
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => Collaborator[];
}

/** Ohne Provider gibt es keine Mitbearbeiter. Geteilte Instanz, damit die Identitaet stabil bleibt. */
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
        // Zwischen dem Anlegen des Stores und diesem Abonnement kann sich jemand
        // verbunden haben - einmal frisch lesen schliesst die Luecke.
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

/**
 * Die anderen Bearbeiter, ohne einen selbst. Rendert neu, sobald jemand kommt,
 * geht oder den Cursor bewegt.
 */
export function useCollaborators(awareness: Awareness | null): Collaborator[] {
  const store = useMemo(() => createPresenceStore(awareness), [awareness]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

/** Schluessel fuer die Zellsuche. */
export function cellKey(rowId: string, columnKey: string): string {
  return `${rowId}|${columnKey}`;
}

/**
 * Zelle -> Bearbeiter, der dort steht.
 *
 * Stehen mehrere auf derselben Zelle, gewinnt der mit der kleineren Client-ID.
 * Willkuerlich, aber stabil - es soll nicht flackern, welcher Name angezeigt wird.
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

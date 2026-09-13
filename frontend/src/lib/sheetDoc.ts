import { useMemo, useSyncExternalStore } from 'react';
import * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';

/**
 * Data model of the collaborative sheet. The Hocuspocus server is agnostic about the
 * structure -- it only applies and stores Yjs updates -- so the shape is defined here.
 *
 *   doc.getArray('rows')  ->  Y.Array<Y.Map<string>>
 *
 * The Y.Array carries the row order, each row is a Y.Map from column key to cell
 * content. Concurrent edits in different cells of a row merge without conflict; on the
 * same cell Yjs' last writer wins.
 *
 * Cell contents are plain strings. Y.Text would merge character-wise but needs an
 * editor per cell, which a grid committing whole cells does not have.
 */

const ROWS_KEY = 'rows';
const ROW_ID_KEY = 'id';

/** Number of columns. They are fixed; the document carries no metadata. */
const COLUMN_COUNT = 10;

/** Rows a freshly created document starts with so it does not look empty. */
export const INITIAL_ROW_COUNT = 25;

export interface SheetColumn {
  /** Key in the Y.Map. Not the label -- that may change, the stored document must not. */
  key: string;
  label: string;
}

export const SHEET_COLUMNS: readonly SheetColumn[] = Array.from(
  { length: COLUMN_COUNT },
  (_unused, index) => ({ key: `c${index}`, label: String.fromCharCode(65 + index) }),
);

/** A row flattened for AG Grid: { id, position, c0, c1, ... }. */
export interface SheetRow {
  id: string;
  /**
   * 1-based row number. Part of the row data instead of derived from node.rowIndex: AG
   * Grid only refreshes a row when its data changed, and deleting a row moves the ones
   * below up without changing theirs.
   */
  position: number;
  [column: string]: string | number;
}

/**
 * 'connecting', 'connected' and 'disconnected' map onto the HocuspocusProvider's
 * WebSocketStatus. 'local' is the case without a provider, 'unauthorized' a rejected
 * login -- the provider reports that as its own event, not as a socket state.
 */
export type SheetDocStatus =
  | 'local'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'unauthorized';

/** Return value of the document hooks, shared by useLocalSheetDoc (#45) and useSheetDoc (#44). */
export interface SheetDocState {
  doc: Y.Doc;
  status: SheetDocStatus;
  /**
   * Set once the server confirmed the connection as 'readonly' (viewer role). The grid
   * blocks input; the server discards changes from viewers anyway.
   */
  readOnly: boolean;
  /** Presence channel, null without a provider. */
  awareness: Awareness | null;
  /** Changes not yet acknowledged by the server. */
  pendingChanges: number;
}

export function sheetStatusLabel(status: SheetDocStatus): string {
  switch (status) {
    case 'local':
      return 'Nur lokal';
    case 'connecting':
      return 'Verbinde …';
    case 'connected':
      return 'Verbunden';
    case 'disconnected':
      return 'Getrennt';
    case 'unauthorized':
      return 'Kein Zugriff';
  }
}

// --- Document access -------------------------------------------------------

function getRows(doc: Y.Doc): Y.Array<Y.Map<string>> {
  return doc.getArray<Y.Map<string>>(ROWS_KEY);
}

function createRow(): Y.Map<string> {
  const row = new Y.Map<string>();
  row.set(ROW_ID_KEY, crypto.randomUUID());
  return row;
}

/**
 * Adds missing rows up to the minimum, idempotent and in one transaction.
 *
 * Must not run before the provider applied the server state (#44): on a still-empty
 * document it would create blank rows that then precede the real content.
 */
export function ensureRows(doc: Y.Doc, minimum: number): void {
  const rows = getRows(doc);
  const missing = minimum - rows.length;
  if (missing <= 0) return;

  doc.transact(() => {
    rows.push(Array.from({ length: missing }, () => createRow()));
  });
}

export function appendRow(doc: Y.Doc): void {
  getRows(doc).push([createRow()]);
}

/**
 * Tells a truly empty document from one someone deleted rows from -- ensureRows alone
 * would refill a deliberately short sheet.
 */
export function countRows(doc: Y.Doc): number {
  return getRows(doc).length;
}

function findRowIndex(rows: Y.Array<Y.Map<string>>, rowId: string): number {
  return rows.toArray().findIndex((row) => row.get(ROW_ID_KEY) === rowId);
}

export function removeRow(doc: Y.Doc, rowId: string): void {
  const rows = getRows(doc);
  const index = findRowIndex(rows, rowId);
  // Not an error: another session may have deleted the row already.
  if (index >= 0) rows.delete(index, 1);
}

/** Writes a cell. Returns whether anything changed, as AG Grid's valueSetter expects. */
export function setCell(doc: Y.Doc, rowId: string, column: string, value: string): boolean {
  const rows = getRows(doc);
  const index = findRowIndex(rows, rowId);
  if (index < 0) return false;

  const row = rows.get(index);
  if ((row.get(column) ?? '') === value) return false;

  // Cleared cells are deleted rather than stored as "", to keep the snapshot small.
  if (value === '') row.delete(column);
  else row.set(column, value);
  return true;
}

// --- Reading for AG Grid ---------------------------------------------------

function readRows(rows: Y.Array<Y.Map<string>>): SheetRow[] {
  return rows.toArray().map((row, index) => {
    // Fallback for rows written without an id. getRowId needs unique values, otherwise
    // AG Grid mixes up rows on the next update.
    const entry: SheetRow = { id: row.get(ROW_ID_KEY) ?? `row-${index}`, position: index + 1 };
    for (const column of SHEET_COLUMNS) {
      entry[column.key] = row.get(column.key) ?? '';
    }
    return entry;
  });
}

interface RowsStore {
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => SheetRow[];
}

function createRowsStore(doc: Y.Doc): RowsStore {
  const rows = getRows(doc);
  const listeners = new Set<() => void>();
  let snapshot = readRows(rows);

  const handleChange = () => {
    snapshot = readRows(rows);
    for (const listener of listeners) listener();
  };

  return {
    subscribe: (onStoreChange) => {
      if (listeners.size === 0) {
        rows.observeDeep(handleChange);
        // A change may have arrived between store creation (render) and this
        // subscription (effect) -- for #44 the first server state.
        snapshot = readRows(rows);
      }
      listeners.add(onStoreChange);

      return () => {
        listeners.delete(onStoreChange);
        if (listeners.size === 0) rows.unobserveDeep(handleChange);
      };
    },
    getSnapshot: () => snapshot,
  };
}

/**
 * Document contents as plain row objects, re-rendered on every document change.
 * useSyncExternalStore avoids pulling the initial state in with a synchronous setState.
 */
export function useSheetRows(doc: Y.Doc): SheetRow[] {
  const store = useMemo(() => createRowsStore(doc), [doc]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

// --- Local document (#45) --------------------------------------------------

/**
 * Documents already opened in this session, keyed by sheet ID. Without it the path
 * overview -> sheet -> overview -> sheet would discard every input. A module cache and
 * not React state, so it outlives unmounting; empty again after a page reload.
 */
const localDocs = new Map<string, Y.Doc>();

function getLocalSheetDoc(sheetId: string): Y.Doc {
  const existing = localDocs.get(sheetId);
  if (existing) return existing;

  const created = new Y.Doc({ guid: sheetId });
  ensureRows(created, INITIAL_ROW_COUNT);
  localDocs.set(sheetId, created);
  return created;
}

/**
 * Document without networking: the content survives switching between overview and
 * sheet, but neither a reload nor a second tab. Unused since #44, kept as the fallback
 * if the backend is unavailable -- useSheetDoc returns the same shape.
 */
export function useLocalSheetDoc(sheetId: string | undefined): SheetDocState {
  const key = sheetId ?? 'kein-sheet';

  // No doc.destroy(): the document belongs to the cache, not to this mount.
  const doc = useMemo(() => getLocalSheetDoc(key), [key]);

  return { doc, status: 'local', readOnly: false, awareness: null, pendingChanges: 0 };
}

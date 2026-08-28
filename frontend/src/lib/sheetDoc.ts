import { useMemo, useSyncExternalStore } from 'react';
import * as Y from 'yjs';

/**
 * Datenmodell des kollaborativen Sheets.
 *
 * Der Hocuspocus-Server ist bezueglich der Struktur agnostisch: onLoadDocument
 * spielt nur ein Y.applyUpdate ein, onStoreDocument schreibt ein
 * Y.encodeStateAsUpdate zurueck. Die Form des Dokuments wird also ausschliesslich
 * hier festgelegt.
 *
 *   doc.getArray('rows')  ->  Y.Array<Y.Map<string>>
 *
 * Die Y.Array traegt die Reihenfolge der Zeilen, jede Zeile ist eine Y.Map von
 * Spaltenschluessel auf Zellinhalt. Zwei gleichzeitige Bearbeitungen in
 * verschiedenen Zellen derselben Zeile verschmelzen damit ohne Konflikt; nur zwei
 * Schreibvorgaenge auf dieselbe Zelle muessen entschieden werden, und dort gilt
 * Yjs' letzter Schreiber.
 *
 * Zellinhalte sind Strings, keine Y.Text. Y.Text wuerde zeichenweises
 * Zusammenfuehren innerhalb einer Zelle erlauben, verlangt dafuer aber einen
 * Editor pro Zelle. Fuer eine Tabelle, in der eine Zelle als Ganzes bestaetigt
 * wird, ist der String der ehrlichere Typ.
 */

const ROWS_KEY = 'rows';
const ROW_ID_KEY = 'id';

/** Spaltenzahl der Tabelle. Die Spalten sind fest, das Dokument traegt keine Metadaten. */
const COLUMN_COUNT = 10;

/** Zeilen, die ein frisch angelegtes Dokument mitbringt, damit es nicht leer erscheint. */
export const INITIAL_ROW_COUNT = 25;

export interface SheetColumn {
  /**
   * Schluessel in der Y.Map. Bewusst nicht der angezeigte Buchstabe: die
   * Beschriftung darf sich spaeter aendern, das gespeicherte Dokument nicht.
   */
  key: string;
  label: string;
}

export const SHEET_COLUMNS: readonly SheetColumn[] = Array.from(
  { length: COLUMN_COUNT },
  (_unused, index) => ({ key: `c${index}`, label: String.fromCharCode(65 + index) }),
);

/** Eine Zeile, flachgeklopft fuer AG Grid: { id, position, c0, c1, ... }. */
export interface SheetRow {
  id: string;
  /**
   * 1-basierte Position im Dokument, also die angezeigte Zeilennummer.
   *
   * Die Nummer steht bewusst in den Zeilendaten und wird nicht im Grid aus
   * node.rowIndex berechnet. AG Grid frischt eine Zeile nur auf, wenn sich ihre
   * Daten geaendert haben - beim Loeschen einer Zeile rutschen die darunter
   * liegenden zwar hoch, ihre Daten bleiben aber gleich, und eine aus rowIndex
   * abgeleitete Nummer bliebe stehen. Als Teil der Daten aendert sie sich mit
   * und wird zuverlaessig neu gezeichnet.
   */
  position: number;
  [column: string]: string | number;
}

/**
 * Verbindungszustand des Dokuments. 'local' ist der Fall aus #45 - ein Dokument
 * ohne Provider, das nur in diesem Tab existiert. Die uebrigen Werte bedient #44.
 */
export type SheetDocStatus = 'local' | 'connecting' | 'connected' | 'disconnected';

/** Rueckgabe der Dokument-Hooks. useLocalSheetDoc (#45) und useSheetDoc (#44) teilen sie sich. */
export interface SheetDocState {
  doc: Y.Doc;
  status: SheetDocStatus;
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
  }
}

// --- Zugriff auf das Dokument ---------------------------------------------

function getRows(doc: Y.Doc): Y.Array<Y.Map<string>> {
  return doc.getArray<Y.Map<string>>(ROWS_KEY);
}

function createRow(): Y.Map<string> {
  const row = new Y.Map<string>();
  row.set(ROW_ID_KEY, crypto.randomUUID());
  return row;
}

/**
 * Ergaenzt fehlende Zeilen bis zur Mindestanzahl - idempotent und in einer
 * einzigen Transaktion, damit die Beobachter nur einmal auslaufen.
 *
 * Wichtig fuer #44: das darf erst laufen, wenn der Provider den Serverstand
 * eingespielt hat. Auf einem noch leeren Dokument wuerden sonst Leerzeilen
 * entstehen, die anschliessend vor dem echten Inhalt stehen.
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

function findRowIndex(rows: Y.Array<Y.Map<string>>, rowId: string): number {
  return rows.toArray().findIndex((row) => row.get(ROW_ID_KEY) === rowId);
}

export function removeRow(doc: Y.Doc, rowId: string): void {
  const rows = getRows(doc);
  const index = findRowIndex(rows, rowId);
  // Kein Fund ist kein Fehler: eine andere Sitzung kann die Zeile bereits
  // geloescht haben, waehrend hier noch der Knopf sichtbar war.
  if (index >= 0) rows.delete(index, 1);
}

/**
 * Schreibt eine Zelle. Der Rueckgabewert sagt, ob sich etwas geaendert hat - AG
 * Grids valueSetter erwartet genau das.
 */
export function setCell(doc: Y.Doc, rowId: string, column: string, value: string): boolean {
  const rows = getRows(doc);
  const index = findRowIndex(rows, rowId);
  if (index < 0) return false;

  const row = rows.get(index);
  if ((row.get(column) ?? '') === value) return false;

  // Leergeraeumte Zellen werden entfernt statt als "" abgelegt. Das Dokument
  // wandert als Ganzes in die Spalte sheets.yjs_snapshot; leere Eintraege dort
  // waeren nur Ballast.
  if (value === '') row.delete(column);
  else row.set(column, value);
  return true;
}

// --- Lesen fuer AG Grid ----------------------------------------------------

function readRows(rows: Y.Array<Y.Map<string>>): SheetRow[] {
  return rows.toArray().map((row, index) => {
    // Der Rueckfall greift nur bei Zeilen, die ein anderer Schreiber ohne id
    // angelegt hat. AG Grid braucht ueber getRowId eindeutige Werte, sonst
    // vertauscht es beim naechsten Update die Zeilen.
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
        // Zwischen dem Anlegen des Stores (Render) und diesem Abonnement (Effekt)
        // kann bereits eine Aenderung eingetroffen sein - bei #44 der erste
        // Serverstand. Einmal frisch lesen schliesst diese Luecke. React
        // vergleicht danach mit dem zuletzt gerenderten Snapshot und rendert
        // hoechstens ein weiteres Mal; eine Schleife entsteht nicht, weil
        // getSnapshot ab da denselben Wert zurueckgibt.
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
 * Liefert den Inhalt des Dokuments als einfache Zeilenobjekte und rendert neu,
 * sobald sich das Dokument aendert - gleich ob durch eine Eingabe in diesem Tab
 * oder spaeter durch ein Update vom Server.
 *
 * useSyncExternalStore statt useState plus useEffect: ein Effekt muesste den
 * Anfangszustand mit einem synchronen setState nachziehen, was der React
 * Compiler zu Recht bemaengelt.
 */
export function useSheetRows(doc: Y.Doc): SheetRow[] {
  const store = useMemo(() => createRowsStore(doc), [doc]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

// --- Lokales Dokument (#45) ------------------------------------------------

/**
 * Dokumente, die bereits in dieser Sitzung geoeffnet wurden, nach Sheet-ID.
 *
 * Ohne diesen Zwischenspeicher entstuende bei jedem Betreten der Ansicht ein
 * frisches Dokument, und der Weg Uebersicht -> Sheet -> Uebersicht -> Sheet
 * wuerde jede Eingabe verwerfen. Das Dokument haelt weder Socket noch Timer, es
 * kostet nur den Speicher der eingegebenen Zellen.
 *
 * Bewusst ein Modul-Zwischenspeicher und kein React-State: er soll das Aus- und
 * Einhaengen der Ansicht ueberdauern. Beim Neuladen der Seite ist er leer - eine
 * echte Speicherung gibt es erst mit #44 ueber sheets.yjs_snapshot.
 */
const localDocs = new Map<string, Y.Doc>();

function getLocalSheetDoc(sheetId: string): Y.Doc {
  const existing = localDocs.get(sheetId);
  if (existing) return existing;

  // Die guid dient nur der Nachvollziehbarkeit; ohne Provider wertet sie niemand aus.
  const created = new Y.Doc({ guid: sheetId });
  ensureRows(created, INITIAL_ROW_COUNT);
  localDocs.set(sheetId, created);
  return created;
}

/**
 * Dokument ohne Netz: der Inhalt ueberlebt den Wechsel zwischen Uebersicht und
 * Sheet, aber weder ein Neuladen noch einen zweiten Tab. Das reicht, um die
 * Tabelle zu bedienen und vorzufuehren; das Speichern und das Synchronisieren
 * zwischen Nutzern bringt #44 mit dem HocuspocusProvider.
 *
 * Die Signatur entspricht der von useSheetDoc(sheetId) aus #44, damit dort nur
 * der Aufruf in sheetView.tsx ausgetauscht werden muss.
 */
export function useLocalSheetDoc(sheetId: string | undefined): SheetDocState {
  const key = sheetId ?? 'kein-sheet';

  // Kein doc.destroy() beim Aufraeumen: das Dokument gehoert dem Zwischenspeicher
  // und nicht dieser Einhaengung. In #44 gehoert es dem Provider.
  const doc = useMemo(() => getLocalSheetDoc(key), [key]);

  return { doc, status: 'local' };
}

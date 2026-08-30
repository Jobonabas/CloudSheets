import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  CellClassParams,
  CellFocusedEvent,
  ColDef,
  GetRowIdParams,
  GridApi,
  GridReadyEvent,
  ICellRendererParams,
  ValueSetterParams,
} from 'ag-grid-community';
import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import {
  SHEET_COLUMNS,
  appendRow,
  removeRow,
  setCell,
  useSheetRows,
  type SheetRow,
} from '../lib/sheetDoc';
import {
  PRESENCE_COLOR_COUNT,
  buildCursorMap,
  cellKey,
  publishCell,
  useCollaborators,
  type Collaborator,
} from '../lib/presence';

import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

interface SheetGridProps {
  /** Das Dokument, dessen Inhalt die Tabelle zeigt und bearbeitet. */
  doc: Y.Doc;
  /**
   * Sperrt jede Aenderung. onAuthenticate im Backend meldet 'readonly' fuer die
   * Viewer-Rolle, und Hocuspocus verwirft Updates solcher Verbindungen - ohne
   * diese Sperre tippt ein Viewer ins Leere und merkt es erst, wenn nichts ankommt.
   */
  readOnly?: boolean;
  /**
   * Anwesenheitskanal. null ohne Provider - dann gibt es niemanden, dessen Cursor
   * man zeichnen koennte, und die Tabelle verhaelt sich wie vorher.
   */
  awareness?: Awareness | null;
}

/**
 * Die Tabelle selbst. Sie kennt nur ein Y.Doc, keinen Provider und keine Route -
 * ob das Dokument lokal ist (#45) oder an einem WebSocket haengt (#44), aendert
 * hier nichts.
 *
 * Es gibt genau einen Lese- und einen Schreibweg:
 *
 *   Dokument  -> useSheetRows -> rowData
 *   valueSetter -> setCell    -> Dokument
 *
 * Der valueSetter schreibt ausschliesslich ins Dokument und fasst die Zeilenobjekte
 * nicht an. Die neuen Werte kommen den Umweg ueber den Beobachter zurueck - damit
 * sieht eine Eingabe im eigenen Tab denselben Weg wie eine Aenderung von aussen,
 * und beide koennen nicht auseinanderlaufen.
 *
 * Die Cursor der anderen (#47) laufen bewusst NICHT ueber das Dokument, sondern
 * ueber Yjs' Awareness. Sie sind fluechtig und haben in sheets.yjs_snapshot nichts
 * verloren.
 */
export default function SheetGrid({ doc, readOnly = false, awareness = null }: SheetGridProps) {
  const rows = useSheetRows(doc);
  const collaborators = useCollaborators(awareness);

  const gridApiRef = useRef<GridApi<SheetRow> | null>(null);

  // Die Cursor liegen in einer Ref und nicht im Zustand der Spaltendefinitionen.
  // Wuerden die Spalten sich bei jeder fremden Bewegung neu aufbauen, wuerfe AG
  // Grid die Tabelle jedes Mal weg. So bleiben die Definitionen stabil und nur die
  // betroffenen Zellen werden aufgefrischt.
  const cursorsRef = useRef<Map<string, Collaborator>>(new Map());

  useEffect(() => {
    cursorsRef.current = buildCursorMap(collaborators);
    // cellClassRules und der Renderer lesen die Ref erst beim Auffrischen. Ohne
    // diesen Anstoss bewegte sich ein fremder Rahmen erst beim naechsten
    // Tastendruck - dieselbe Falle wie bei den Zeilennummern in #45.
    gridApiRef.current?.refreshCells({ force: true });
  }, [collaborators]);

  const cursorAt = useCallback((rowId: string | undefined, columnKey: string | undefined) => {
    if (!rowId || !columnKey) return undefined;
    return cursorsRef.current.get(cellKey(rowId, columnKey));
  }, []);

  const columnDefs = useMemo<ColDef<SheetRow>[]>(() => {
    const rowNumber: ColDef<SheetRow> = {
      headerName: '',
      width: 56,
      pinned: 'left',
      editable: false,
      sortable: false,
      filter: false,
      resizable: false,
      suppressMovable: true,
      cellClass: 'cell-rownum',
      // Kommt aus den Zeilendaten, nicht aus node.rowIndex - siehe SheetRow.position.
      field: 'position',
    };

    // cellClassRules statt cellClass: AG Grid wertet nur die Regeln beim
    // Auffrischen neu aus, eine cellClass-Funktion greift bloss beim Anlegen.
    const cursorClassRules = (columnKey: string): Record<string, (p: CellClassParams<SheetRow>) => boolean> => {
      const rules: Record<string, (p: CellClassParams<SheetRow>) => boolean> = {
        'remote-cursor': (params) => Boolean(cursorAt(params.data?.id, columnKey)),
      };
      for (let index = 0; index < PRESENCE_COLOR_COUNT; index += 1) {
        rules[`remote-cursor--${index}`] = (params) =>
          cursorAt(params.data?.id, columnKey)?.user.colorIndex === index;
      }
      return rules;
    };

    const cells: ColDef<SheetRow>[] = SHEET_COLUMNS.map((column) => ({
      field: column.key,
      headerName: column.label,
      flex: 1,
      minWidth: 100,
      editable: !readOnly,
      sortable: false,
      filter: false,
      cellClassRules: cursorClassRules(column.key),
      cellRenderer: (params: ICellRendererParams<SheetRow>) => {
        const cursor = cursorAt(params.data?.id, column.key);
        const value = params.value == null ? '' : String(params.value);
        if (!cursor) return value;
        return (
          <>
            {value}
            {/* Sitzt am Rahmen der Zelle, siehe .remote-cursor__label in index.css. */}
            <span className="remote-cursor__label">{cursor.user.name}</span>
          </>
        );
      },
      valueSetter: (params: ValueSetterParams<SheetRow>) => {
        if (readOnly || !params.data) return false;
        return setCell(doc, params.data.id, column.key, String(params.newValue ?? ''));
      },
    }));

    // Sortieren und Filtern sind hier abgeschaltet: die Zeilenreihenfolge steht im
    // Dokument, und eine sortierte Ansicht wuerde Zeilennummer und Loeschknopf auf
    // eine andere Zeile zeigen lassen als die im Dokument darunter.

    if (readOnly) return [rowNumber, ...cells];

    const actions: ColDef<SheetRow> = {
      headerName: '',
      width: 64,
      pinned: 'right',
      editable: false,
      sortable: false,
      filter: false,
      resizable: false,
      suppressMovable: true,
      cellRenderer: (params: ICellRendererParams<SheetRow>) => {
        const row = params.data;
        if (!row) return null;
        return (
          <button
            type="button"
            className="btn btn--danger"
            title="Zeile löschen"
            aria-label="Zeile löschen"
            onClick={() => { removeRow(doc, row.id); }}
          >
            ×
          </button>
        );
      },
    };

    return [rowNumber, ...cells, actions];
  }, [doc, readOnly, cursorAt]);

  const defaultColDef = useMemo<ColDef<SheetRow>>(() => ({ resizable: true }), []);

  // Ohne stabile Zeilen-ID wirft AG Grid bei jeder Aenderung alle Zeilen weg und
  // baut sie neu auf - eine offene Zelle waere dann bei jedem fremden Tastendruck
  // geschlossen. Mit der ID aktualisiert das Grid nur, was sich geaendert hat.
  const getRowId = useCallback((params: GetRowIdParams<SheetRow>) => params.data.id, []);

  const onGridReady = useCallback((event: GridReadyEvent<SheetRow>) => {
    gridApiRef.current = event.api;
  }, []);

  // Meldet den eigenen Cursor. Auch Viewer melden ihn - wer nur zusieht, darf
  // trotzdem zeigen, wo er gerade liest.
  const onCellFocused = useCallback((event: CellFocusedEvent<SheetRow>) => {
    if (!awareness) return;

    const columnKey = typeof event.column === 'string' ? event.column : event.column?.getColId();
    const rowId = event.rowIndex == null
      ? undefined
      : event.api.getDisplayedRowAtIndex(event.rowIndex)?.data?.id;

    // Die Spalten fuer Zeilennummer und Loeschknopf tragen keinen Zellinhalt; ein
    // Cursor darauf waere fuer die anderen nicht zuzuordnen.
    const isSheetColumn = SHEET_COLUMNS.some((column) => column.key === columnKey);
    publishCell(awareness, rowId && columnKey && isSheetColumn ? { rowId, columnKey } : null);
  }, [awareness]);

  // Beim Verlassen der Ansicht den eigenen Cursor abmelden. Ohne das bliebe die
  // Markierung bei den anderen stehen, bis die Verbindung auslaeuft.
  useEffect(() => {
    if (!awareness) return;
    return () => { publishCell(awareness, null); };
  }, [awareness]);

  const handleAppendRow = useCallback(() => { appendRow(doc); }, [doc]);

  return (
    <div className="sheet-grid">
      <div className="sheet-grid__bar">
        <span className="sheet-grid__count">
          {rows.length === 1 ? '1 Zeile' : `${rows.length} Zeilen`}
        </span>
        {readOnly ? (
          <span className="sheet-grid__hint">Nur Lesezugriff</span>
        ) : (
          <button type="button" className="btn btn--outline btn--sm" onClick={handleAppendRow}>
            Zeile hinzufügen
          </button>
        )}
      </div>

      <div className="ag-theme-quartz card sheet-grid__viewport">
        <AgGridReact<SheetRow>
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          getRowId={getRowId}
          onGridReady={onGridReady}
          onCellFocused={onCellFocused}
          // Ein Klick neben die Zelle soll den Wert uebernehmen. Ohne das bleibt die
          // Zelle offen und die Eingabe haengt sichtbar in der Luft.
          stopEditingWhenCellsLoseFocus
          suppressMovableColumns
          overlayNoRowsTemplate={'<div class="grid-empty">Keine Zeilen — leg oben eine an.</div>'}
        />
      </div>
    </div>
  );
}

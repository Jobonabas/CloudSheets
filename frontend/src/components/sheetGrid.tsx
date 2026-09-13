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
  doc: Y.Doc;
  /** Blocks input for the viewer role; Hocuspocus discards their updates anyway. */
  readOnly?: boolean;
  /** Presence channel, null without a provider. */
  awareness?: Awareness | null;
}

/**
 * The grid itself. It knows only a Y.Doc, no provider and no route, so a local (#45)
 * and a synced (#44) document behave the same here.
 *
 *   document    -> useSheetRows -> rowData
 *   valueSetter -> setCell      -> document
 *
 * The valueSetter writes to the document only; the new values return through the
 * observer, so local input takes the same path as a remote change.
 *
 * Remote cursors (#47) travel through Yjs' awareness and not through the document --
 * they are ephemeral and do not belong in sheets.yjs_snapshot.
 */
export default function SheetGrid({ doc, readOnly = false, awareness = null }: SheetGridProps) {
  const rows = useSheetRows(doc);
  const collaborators = useCollaborators(awareness);

  const gridApiRef = useRef<GridApi<SheetRow> | null>(null);

  // In a ref and not in the column definitions: rebuilding the columns on every remote
  // movement would make AG Grid discard the grid each time.
  const cursorsRef = useRef<Map<string, Collaborator>>(new Map());

  useEffect(() => {
    cursorsRef.current = buildCursorMap(collaborators);
    // cellClassRules and the renderer read the ref only on refresh.
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
      // Comes from the row data, not from node.rowIndex -- see SheetRow.position.
      field: 'position',
    };

    // cellClassRules, not cellClass: only the rules are re-evaluated on refresh.
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
            {/* Sits on the cell border, see .remote-cursor__label in index.css. */}
            <span className="remote-cursor__label">{cursor.user.name}</span>
          </>
        );
      },
      valueSetter: (params: ValueSetterParams<SheetRow>) => {
        if (readOnly || !params.data) return false;
        return setCell(doc, params.data.id, column.key, String(params.newValue ?? ''));
      },
    }));

    // Sorting and filtering are off: the row order lives in the document, and a sorted
    // view would point the row number and delete button at the wrong row.

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

  // Without a stable row ID, AG Grid rebuilds all rows on every change and an open
  // cell would close on every remote keystroke.
  const getRowId = useCallback((params: GetRowIdParams<SheetRow>) => params.data.id, []);

  const onGridReady = useCallback((event: GridReadyEvent<SheetRow>) => {
    gridApiRef.current = event.api;
  }, []);

  // Viewers publish a cursor as well.
  const onCellFocused = useCallback((event: CellFocusedEvent<SheetRow>) => {
    if (!awareness) return;

    const columnKey = typeof event.column === 'string' ? event.column : event.column?.getColId();
    const rowId = event.rowIndex == null
      ? undefined
      : event.api.getDisplayedRowAtIndex(event.rowIndex)?.data?.id;

    // The row-number and delete columns carry no cell content.
    const isSheetColumn = SHEET_COLUMNS.some((column) => column.key === columnKey);
    publishCell(awareness, rowId && columnKey && isSheetColumn ? { rowId, columnKey } : null);
  }, [awareness]);

  // Otherwise the marker stays with the others until the connection times out.
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
          // A click outside the cell commits the value instead of leaving it open.
          stopEditingWhenCellsLoseFocus
          suppressMovableColumns
          overlayNoRowsTemplate={'<div class="grid-empty">Keine Zeilen — leg oben eine an.</div>'}
        />
      </div>
    </div>
  );
}

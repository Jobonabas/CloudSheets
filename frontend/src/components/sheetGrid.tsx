import { useCallback, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  ColDef,
  GetRowIdParams,
  ICellRendererParams,
  ValueSetterParams,
} from 'ag-grid-community';
import type * as Y from 'yjs';
import {
  SHEET_COLUMNS,
  appendRow,
  removeRow,
  setCell,
  useSheetRows,
  type SheetRow,
} from '../lib/sheetDoc';

import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

interface SheetGridProps {
  /** Das Dokument, dessen Inhalt die Tabelle zeigt und bearbeitet. */
  doc: Y.Doc;
  /**
   * Sperrt jede Aenderung. Gedacht fuer #44: onChange im Hocuspocus-Server
   * verwirft Aenderungen von Viewern still - ohne diese Sperre tippt ein Viewer
   * ins Leere und merkt es erst, wenn nichts ankommt.
   */
  readOnly?: boolean;
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
 */
export default function SheetGrid({ doc, readOnly = false }: SheetGridProps) {
  const rows = useSheetRows(doc);

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

    const cells: ColDef<SheetRow>[] = SHEET_COLUMNS.map((column) => ({
      field: column.key,
      headerName: column.label,
      flex: 1,
      minWidth: 100,
      editable: !readOnly,
      sortable: false,
      filter: false,
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
  }, [doc, readOnly]);

  const defaultColDef = useMemo<ColDef<SheetRow>>(() => ({ resizable: true }), []);

  // Ohne stabile Zeilen-ID wirft AG Grid bei jeder Aenderung alle Zeilen weg und
  // baut sie neu auf - eine offene Zelle waere dann bei jedem fremden Tastendruck
  // geschlossen. Mit der ID aktualisiert das Grid nur, was sich geaendert hat.
  const getRowId = useCallback((params: GetRowIdParams<SheetRow>) => params.data.id, []);

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

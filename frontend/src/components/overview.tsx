import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';
import type {
  ColDef,
  GridApi,
  GridReadyEvent,
  ICellRendererParams,
  ModelUpdatedEvent,
  RowClickedEvent,
} from 'ag-grid-community';
import { useSession } from '../auth/session';
import { compareSheetDate } from '../lib/dates';

import ShareDialog from './shareDialog';

import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

export interface TableItem {
  id: string;
  title: string;
  owner_id: string;
  // ISO strings, not Date objects -- that is how they arrive in the backend's JSON.
  created_at: string;
  updated_at: string;
}

interface OverviewProps {
  apiUrl: string;
}

// Backend errors are { message, success: false }; the message beats the status code.
async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.message === 'string') return body.message;
  } catch {
    // Response without a JSON body, the fallback stands
  }
  return fallback;
}

// The backend returns { userSheets, sharedSheets }, not an array directly.
async function fetchSheets(apiUrl: string, token: string): Promise<TableItem[]> {
  const res = await fetch(`${apiUrl}/sheets`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  // The backend answers an empty list with 404 "No sheets found". For the overview
  // that is an empty table, not an error.
  if (res.status === 404) {
    return [];
  }
  if (!res.ok) {
    throw new Error(await readError(res, `HTTP ${res.status}`));
  }
  const data = await res.json();
  return [...(data.userSheets ?? []), ...(data.sharedSheets ?? [])];
}

async function createSheet(apiUrl: string, token: string, title: string): Promise<void> {
  const now = new Date().toISOString();
  const res = await fetch(`${apiUrl}/sheets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    // Required by the POST schema. The client assigns the ID, the backend the owner_id.
    body: JSON.stringify({
      id: crypto.randomUUID(),
      title,
      created_at: now,
      updated_at: now,
    }),
  });
  if (!res.ok) {
    throw new Error(await readError(res, `HTTP ${res.status}`));
  }
}

async function deleteSheet(apiUrl: string, token: string, id: string): Promise<void> {
  const res = await fetch(`${apiUrl}/sheets/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(await readError(res, `HTTP ${res.status}`));
  }
}

export default function Overview({ apiUrl }: OverviewProps) {
  const navigate = useNavigate();
  const { accessToken, userId: currentUserId } = useSession();
  const [rowData, setRowData] = useState<TableItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const gridApiRef = useRef<GridApi<TableItem> | null>(null);
  const [filterActive, setFilterActive] = useState<boolean>(false);
  const [visibleCount, setVisibleCount] = useState<number>(0);
  const [shareSheet, setShareSheet] = useState<TableItem | null>(null);

  useEffect(() => {
    if (!accessToken) return; // no token yet

    let cancelled = false;
    fetchSheets(apiUrl, accessToken)
      .then((sheets) => { if (!cancelled) setRowData(sheets); })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [apiUrl, accessToken]);

  // The POST does not return the created sheet, so a refetch is needed anyway.
  const reload = useCallback(async () => {
    if (!accessToken) return;
    setRowData(await fetchSheets(apiUrl, accessToken));
  }, [apiUrl, accessToken]);

  const handleCreate = useCallback(async () => {
    const title = newTitle.trim();
    if (!accessToken || !title) return;

    setBusy(true);
    setError(null);
    try {
      await createSheet(apiUrl, accessToken, title);
      setNewTitle('');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setBusy(false);
    }
  }, [apiUrl, accessToken, newTitle, reload]);

  const handleDelete = useCallback(async (sheet: TableItem) => {
    if (!accessToken) return;
    if (!window.confirm(`Sheet "${sheet.title}" wirklich loeschen?`)) return;

    setBusy(true);
    setError(null);
    try {
      await deleteSheet(apiUrl, accessToken, sheet.id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setBusy(false);
    }
  }, [apiUrl, accessToken, reload]);

  const columnDefs = useMemo<ColDef<TableItem>[]>(() => [
    { field: 'title', headerName: 'Titel', flex: 2, minWidth: 200, filter: 'agTextColumnFilter' },
    { field: 'created_at', headerName: 'Erstellt', flex: 1, minWidth: 120, filter: 'agDateColumnFilter', filterParams: { comparator: compareSheetDate }, valueFormatter: (p) => new Date(p.value).toLocaleDateString('de-DE') },
    { field: 'updated_at', headerName: 'Geändert', flex: 1, minWidth: 120, filter: 'agDateColumnFilter', filterParams: { comparator: compareSheetDate }, valueFormatter: (p) => new Date(p.value).toLocaleDateString('de-DE') },
    // valueGetter and not valueFormatter, so filter and sort work on the visible text
    // instead of the raw Cognito sub.
    {
      field: 'owner_id',
      headerName: 'Eigentümer',
      width: 130,
      filter: 'agTextColumnFilter',
      valueGetter: (p) => (p.data ? (p.data.owner_id === currentUserId ? 'Ich' : 'Geteilt') : ''),
    },
    { field: 'id', headerName: 'ID', width: 150, filter: 'agTextColumnFilter', cellClass: 'cell-id' },
    {
      headerName: '',
      width: 110,
      sortable: false,
      filter: false,
      resizable: false,
      cellRenderer: (params: ICellRendererParams<TableItem>) => {
        const sheet = params.data;
        // Only the owner may delete; shared sheets would answer 403.
        if (!sheet || sheet.owner_id !== currentUserId) return null;
        return (
          <button
            type="button"
            className="btn btn--danger"
            // Marks the click for onRowClicked, see the reasoning there.
            data-no-row-click=""
            disabled={busy}
            onClick={() => { void handleDelete(sheet); }}
          >
            Löschen
          </button>
        );
      },
    },
    {
      headerName: 'Optionen',
      width: 100,
      sortable: false,
      filter: false,
      cellRenderer: (params: ICellRendererParams<TableItem>) => {
        return (
          <button
            type="button"
            className="btn btn--small"
            data-no-row-click=""
            onClick={() => setShareSheet(params.data ?? null)}
          >
            Teilen
          </button>
        );
      },
    },
  ], [busy, currentUserId, handleDelete]);

  const defaultColDef = useMemo<ColDef>(() => ({ sortable: true, filter: true, resizable: true }), []);

  const onGridReady = useCallback((event: GridReadyEvent<TableItem>) => {
    gridApiRef.current = event.api;
  }, []);

  // modelUpdated also covers new rows after create or delete, unlike filterChanged.
  const onModelUpdated = useCallback((event: ModelUpdatedEvent<TableItem>) => {
    setFilterActive(Object.keys(event.api.getFilterModel()).length > 0);
    setVisibleCount(event.api.getDisplayedRowCount());
  }, []);

  const clearFilters = useCallback(() => {
    gridApiRef.current?.setFilterModel(null);
  }, []);

  const onRowClicked = useCallback((event: RowClickedEvent<TableItem>) => {
    // AG Grid binds its click listener natively to the row, React binds its handlers at
    // the root of the tree, so the row listener runs first and a stopPropagation() in
    // the button handler comes too late.
    const target = event.event?.target as HTMLElement | null;
    if (target?.closest('[data-no-row-click]')) return;

    if (event.data) {
      // Pass the title along so the sheet view can show it without its own request.
      navigate(`/sheet/${event.data.id}`, { state: { title: event.data.title } });
    }
  }, [navigate]);

  return (
    <div>
      <div className="page-head">
        <div className="page-head__title">
          <h1>Meine Sheets</h1>
          <span className="page-head__sub">
            {filterActive
              ? `${visibleCount} von ${rowData.length} Sheets`
              : rowData.length === 1 ? '1 Sheet' : `${rowData.length} Sheets`}
          </span>
          {filterActive && (
            <button type="button" className="btn btn--outline btn--sm" onClick={clearFilters}>
              Filter zurücksetzen
            </button>
          )}
        </div>
        <div className="toolbar">
          <input
            className="input"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void handleCreate(); }}
            placeholder="Titel des neuen Sheets"
            disabled={busy}
          />
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void handleCreate()}
            disabled={busy || !newTitle.trim()}
          >
            Neues Sheet
          </button>
        </div>
      </div>

      {error && <div className="alert">Fehler: {error}</div>}

      <div className="ag-theme-quartz card" style={{ height: 500, width: '100%' }}>
        <AgGridReact
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          onGridReady={onGridReady}
          onModelUpdated={onModelUpdated}
          onRowClicked={onRowClicked}
          rowStyle={{ cursor: 'pointer' }}
          loading={loading}
          overlayNoRowsTemplate={'<div class="grid-empty">Noch keine Sheets — leg oben eins an.</div>'}
          pagination
          paginationPageSize={20}
          paginationPageSizeSelector={[10, 20, 50, 100]}
        />
        {shareSheet && (
          <ShareDialog
            sheetId={shareSheet.id}
            sheetTitle={shareSheet.title}
            apiUrl={apiUrl}
            token={accessToken}
            onClose={() => setShareSheet(null)}
            onShare={() => { void reload()}}
          />
        )}
      </div>
    </div>
  );
}

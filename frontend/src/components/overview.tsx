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
  // ISO-Strings, keine Date-Objekte: so kommen sie aus dem JSON des Backends.
  created_at: string;
  updated_at: string;
}

interface OverviewProps {
  apiUrl: string;
}

// Fehlerantworten des Backends sind { message, success: false }. Die Message ist
// aussagekraeftiger als der blosse Statuscode.
async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.message === 'string') return body.message;
  } catch {
    // Antwort ohne JSON-Body, es bleibt beim Fallback
  }
  return fallback;
}

// Backend gibt { userSheets, sharedSheets } zurueck, nicht direkt ein Array.
async function fetchSheets(apiUrl: string, token: string): Promise<TableItem[]> {
  const res = await fetch(`${apiUrl}/sheets`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  // Auf eine leere Liste antwortet das Backend mit 404 "No sheets found". Fuer die
  // Uebersicht ist das kein Fehler, sondern eine leere Tabelle - sonst landet jeder
  // frisch registrierte Nutzer direkt auf einer Fehlermeldung.
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
    // id, created_at und updated_at sind im POST-Schema Pflicht. Die ID vergibt der
    // Client, owner_id setzt das Backend aus dem JWT.
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
    if (!accessToken) return; // noch kein Token vorhanden

    let cancelled = false;
    fetchSheets(apiUrl, accessToken)
      .then((sheets) => { if (!cancelled) setRowData(sheets); })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [apiUrl, accessToken]);

  // Nach Create und Delete neu laden, damit die Tabelle ohne Reload stimmt. Das POST
  // liefert das angelegte Sheet nicht zurueck, ein Refetch ist also ohnehin noetig.
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
    // Der rohe Cognito-Sub sagt niemandem etwas. Der valueGetter (statt eines
    // valueFormatters) sorgt dafuer, dass Filter und Sortierung auf dem sichtbaren
    // Text arbeiten und nicht auf der ID darunter.
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
        // Loeschen darf nur der Eigentuemer, geteilte Sheets liefern sonst 403.
        if (!sheet || sheet.owner_id !== currentUserId) return null;
        return (
          <button
            type="button"
            className="btn btn--danger"
            // Markiert den Klick fuer onRowClicked, siehe Begruendung dort.
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

  // modelUpdated deckt beides ab: gesetzte Filter und neue Zeilen nach Create oder
  // Delete. Ein reiner filterChanged-Handler wuerde die Anzahl veralten lassen.
  const onModelUpdated = useCallback((event: ModelUpdatedEvent<TableItem>) => {
    setFilterActive(Object.keys(event.api.getFilterModel()).length > 0);
    setVisibleCount(event.api.getDisplayedRowCount());
  }, []);

  const clearFilters = useCallback(() => {
    gridApiRef.current?.setFilterModel(null);
  }, []);

  const onRowClicked = useCallback((event: RowClickedEvent<TableItem>) => {
    // AG Grid haengt seinen Klick-Listener nativ an die Zeile, React seine Handler
    // dagegen an die Wurzel des Baums. Beim Klick auf den Loeschen-Button laeuft der
    // Zeilen-Listener deshalb zuerst - ein stopPropagation() im Button-Handler kommt
    // zu spaet und das Sheet wuerde sich trotz Loeschung noch oeffnen. Also hier am
    // Ursprung des Klicks pruefen, woher er kam.
    const target = event.event?.target as HTMLElement | null;
    if (target?.closest('[data-no-row-click]')) return;

    if (event.data) {
      // Titel mitgeben, damit die Sheet-Ansicht ihn ohne eigenen Request zeigen kann.
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
          {/* Nur sichtbar, solange ein Filter greift - sonst steht dauerhaft ein
              Knopf da, der nichts tut, und ein vergessener Filter bleibt unbemerkt. */}
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

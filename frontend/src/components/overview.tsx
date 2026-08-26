import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, ICellRendererParams, RowClickedEvent } from 'ag-grid-community';
import { useAuth } from 'react-oidc-context';

import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

export interface TableItem {
  id: string;
  title: string;
  owner_id: string;
  created_at: Date;
  updated_at: Date;
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
  const auth = useAuth();
  const accessToken = auth.user?.access_token;
  const currentUserId = auth.user?.profile.sub;
  const [rowData, setRowData] = useState<TableItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);

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
    { field: 'id', headerName: 'ID', width: 90, filter: 'agTextColumnFilter' },
    { field: 'title', headerName: 'Title', flex: 1, filter: 'agTextColumnFilter' },
    { field: 'owner_id', headerName: 'Owner ID', flex: 1, filter: 'agTextColumnFilter' },
    { field: 'created_at', headerName: 'Created At', flex: 1, filter: 'agDateColumnFilter', valueFormatter: (p) => new Date(p.value).toLocaleDateString('de-DE') },
    { field: 'updated_at', headerName: 'Updated At', flex: 1, filter: 'agDateColumnFilter', valueFormatter: (p) => new Date(p.value).toLocaleDateString('de-DE') },
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
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation(); // sonst oeffnet der Row-Click zusaetzlich das Sheet
              void handleDelete(sheet);
            }}
          >
            Loeschen
          </button>
        );
      },
    },
  ], [busy, currentUserId, handleDelete]);

  const defaultColDef = useMemo<ColDef>(() => ({ sortable: true, filter: true, resizable: true }), []);

  const onRowClicked = useCallback((event: RowClickedEvent<TableItem>) => {
    if (event.data) {
      navigate(`/sheet/${event.data.id}`);
    }
  }, [navigate]);

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', gap: '0.5rem', paddingBottom: '1rem' }}>
        <input
          value={newTitle}
          onChange={(event) => setNewTitle(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') void handleCreate(); }}
          placeholder="Titel des neuen Sheets"
          disabled={busy}
        />
        <button type="button" onClick={() => void handleCreate()} disabled={busy || !newTitle.trim()}>
          Neues Sheet
        </button>
      </div>

      {error && <div style={{ color: 'red', paddingBottom: '0.5rem' }}>Fehler: {error}</div>}

      <div className="ag-theme-quartz" style={{ height: 500, width: '100%' }}>
        <AgGridReact
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          onRowClicked={onRowClicked}
          rowStyle={{ cursor: 'pointer' }}
          loading={loading}
          pagination
          paginationPageSize={20}
          paginationPageSizeSelector={[10, 20, 50, 100]}
        />
      </div>
    </div>
  );
}

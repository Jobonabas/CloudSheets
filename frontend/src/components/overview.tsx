import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, RowClickedEvent } from 'ag-grid-community';
import { useAuth } from 'react-oidc-context';

import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

export interface TableItem {
  id: string | number;
  title: string;
  owner_id: string;
  created_at: Date;
  updated_at: Date;
}

interface OverviewProps {
  apiUrl: string;
}

// Backend gibt { userSheets, sharedSheets } zurück, nicht direkt ein Array.
async function fetchSheets(apiUrl: string, token: string): Promise<TableItem[]> {
  const res = await fetch(`${apiUrl}/sheets`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const data = await res.json();
  return [...(data.userSheets ?? []), ...(data.sharedSheets ?? [])];
}

export default function Overview({ apiUrl }: OverviewProps) {
  const navigate = useNavigate();
  const auth = useAuth();
  const accessToken = auth.user?.access_token;
  const [rowData, setRowData] = useState<TableItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const columnDefs = useMemo<ColDef<TableItem>[]>(() => [
    { field: 'id', headerName: 'ID', width: 90, filter: 'agTextColumnFilter' },
    { field: 'title', headerName: 'Title', flex: 1, filter: 'agTextColumnFilter' },
    { field: 'owner_id', headerName: 'Owner ID', flex: 1, filter: 'agTextColumnFilter' },
    { field: 'created_at', headerName: 'Created At', flex: 1, filter: 'agDateColumnFilter', valueFormatter: (p) => new Date(p.value).toLocaleDateString('de-DE') },
    { field: 'updated_at', headerName: 'Updated At', flex: 1, filter: 'agDateColumnFilter', valueFormatter: (p) => new Date(p.value).toLocaleDateString('de-DE') },
  ], []);

  const defaultColDef = useMemo<ColDef>(() => ({ sortable: true, filter: true, resizable: true }), []);

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

  const onRowClicked = useCallback((event: RowClickedEvent<TableItem>) => {
    if (event.data) {
      navigate(`/sheet/${event.data.id}`);
    }
  }, [navigate]);

  if (error) return <div>Fehler: {error}</div>;

  return (
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
  );
}
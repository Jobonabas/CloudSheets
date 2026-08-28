import { useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

interface SheetViewState {
  title?: string;
}

export default function SheetView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // Die Uebersicht reicht den Titel per Router-State mit, damit die Ansicht ihn ohne
  // zusaetzlichen Request zeigen kann. Beim direkten Aufruf eines Links oder nach
  // einem Reload fehlt der State - dann bleibt die ID als Ueberschrift.
  const title = (location.state as SheetViewState | null)?.title;

  const goBack = useCallback(() => { navigate('/'); }, [navigate]);

  return (
    <div>
      <div className="page-head">
        <div className="page-head__title">
          <button type="button" className="btn btn--outline" onClick={goBack}>
            &larr; Übersicht
          </button>
          <h1>{title ?? id}</h1>
        </div>
      </div>

      {/* Platzhalter: das kollaborative Grid haengt an #44 (Yjs an den WebSocket)
          und #45 (AG Grid an Yjs). */}
      <div className="card placeholder">
        <p>Das gemeinsame Bearbeiten folgt in #44 und #45.</p>
        <p className="placeholder__id">{id}</p>
      </div>
    </div>
  );
}

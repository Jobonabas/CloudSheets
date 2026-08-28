import { useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import SheetGrid from './sheetGrid';
import { sheetStatusLabel, useLocalSheetDoc } from '../lib/sheetDoc';

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

  // Hier laeuft die Naht zu #44: dort ersetzt useSheetDoc(id) diesen Aufruf und
  // liefert dieselben zwei Felder, nur aus einem HocuspocusProvider statt aus
  // einem lokalen Dokument. Die Tabelle darunter bleibt unveraendert.
  const { doc, status } = useLocalSheetDoc(id);

  const goBack = useCallback(() => { navigate('/'); }, [navigate]);

  return (
    // sheet-page hebt die Breitenbegrenzung der Hauptspalte auf, siehe index.css.
    <div className="sheet-page">
      <div className="page-head">
        <div className="page-head__title">
          <button type="button" className="btn btn--outline" onClick={goBack}>
            &larr; Übersicht
          </button>
          <h1>{title ?? id}</h1>
          <span className={`status status--${status}`}>{sheetStatusLabel(status)}</span>
        </div>
      </div>

      {/* Solange das Dokument nur lokal ist, waere es unredlich, die Tabelle wie ein
          geteiltes Dokument aussehen zu lassen. Der Hinweis faellt mit #44 weg. */}
      {status === 'local' && (
        <p className="sheet-note">
          Die Eingaben bleiben in diesem Tab und sind nach einem Neuladen wieder fort.
          Das Speichern und Teilen bringt #44.
        </p>
      )}

      <SheetGrid doc={doc} />
    </div>
  );
}

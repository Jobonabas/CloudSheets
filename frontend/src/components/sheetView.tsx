import { useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import SheetGrid from './sheetGrid';
import { sheetStatusLabel } from '../lib/sheetDoc';
import { useSheetDoc } from '../lib/sheetConnection';

interface SheetViewState {
  title?: string;
}

interface SheetViewProps {
  apiUrl: string;
}

export default function SheetView({ apiUrl }: SheetViewProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // Die Uebersicht reicht den Titel per Router-State mit, damit die Ansicht ihn ohne
  // zusaetzlichen Request zeigen kann. Beim direkten Aufruf eines Links oder nach
  // einem Reload fehlt der State - dann bleibt die ID als Ueberschrift.
  const title = (location.state as SheetViewState | null)?.title;

  // Das Dokument kommt aus dem HocuspocusProvider. Fuer den Rueckweg auf ein rein
  // lokales Dokument - falls das Backend vor einer Vorfuehrung ausfaellt - genuegt
  // useLocalSheetDoc(id) aus ../lib/sheetDoc; die Rueckgabe ist dieselbe.
  const { doc, status, readOnly } = useSheetDoc(id, apiUrl);

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

      {/* Ohne Verbindung sieht die Tabelle aus wie immer, nur kommt nichts an und
          geht nichts raus. Das muss dastehen, sonst haelt man sie fuer gespeichert. */}
      {status === 'disconnected' && (
        <p className="sheet-note">
          Keine Verbindung zum Server. Änderungen bleiben vorerst in diesem Tab und
          werden übertragen, sobald die Verbindung wieder steht.
        </p>
      )}

      {status === 'unauthorized' && (
        <div className="alert">
          Keine Berechtigung für dieses Sheet. Bitte lass es dir freigeben oder melde
          dich neu an.
        </div>
      )}

      {readOnly && (
        <p className="sheet-note">
          Du hast Lesezugriff auf dieses Sheet. Eingaben sind deshalb gesperrt.
        </p>
      )}

      <SheetGrid doc={doc} readOnly={readOnly} />
    </div>
  );
}

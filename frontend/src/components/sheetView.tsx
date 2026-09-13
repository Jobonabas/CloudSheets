import { useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import SheetGrid from './sheetGrid';
import { sheetStatusLabel } from '../lib/sheetDoc';
import { useSheetDoc } from '../lib/sheetConnection';
import { useCollaborators } from '../lib/presence';

interface SheetViewState {
  title?: string;
}

interface SheetViewProps {
  apiUrl: string;
}

/**
 * Was waehrend einer Trennung neben dem Abzeichen steht.
 *
 * Der Zustand selbst steht schon im Abzeichen neben dem Titel; hier zu
 * wiederholen, dass die Verbindung weg ist, brauchte es nicht. Diese Zeile sagt
 * die Folge davon - dass nichts verloren geht - und sonst nichts.
 */
function offlineText(pendingChanges: number): string {
  if (pendingChanges === 0) return 'Änderungen werden nachgeholt';
  if (pendingChanges === 1) return '1 Änderung wartet auf Übertragung';
  return `${pendingChanges} Änderungen warten auf Übertragung`;
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
  const { doc, status, readOnly, awareness, pendingChanges } = useSheetDoc(id, apiUrl);
  const collaborators = useCollaborators(awareness);

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
          {/* Das Abzeichen ist die einzige dauerhafte Anzeige des Zustands. Es
              steht immer da und wechselt nur die Farbe, verschiebt also nichts.
              aria-live, damit ein Screenreader den Wechsel mitbekommt. */}
          <span className={`status status--${status}`} role="status" aria-live="polite">
            {sheetStatusLabel(status)}
          </span>

          {/* Ohne Verbindung sieht die Tabelle aus wie immer, nur kommt nichts an
              und geht nichts raus. Das muss dastehen, sonst haelt man sie fuer
              gespeichert.

              Hier in der Titelzeile und nicht als Meldung ueber der Tabelle: Eine
              Zeile, die dort erscheint und wieder verschwindet, schoebe die
              Tabelle bei jedem Ausfall nach unten und wieder zurueck. Diese Zeile
              steht schon und ist so hoch wie ihr hoechstes Element - der Text
              kommt in die Luecke daneben und bewegt nichts.

              Nur bei 'disconnected', nicht schon bei offenen Aenderungen: Solange
              die Verbindung steht, ist der Zaehler nach wenigen Millisekunden
              wieder auf null - der Hinweis blitzte bei jedem Tastendruck auf. */}
          {status === 'disconnected' && (
            <span className="offline-note">{offlineText(pendingChanges)}</span>
          )}
        </div>

        {/* Nur sichtbar, wenn tatsaechlich jemand da ist - eine dauerhaft leere
            Leiste "0 weitere" waere nur Rauschen. */}
        {collaborators.length > 0 && (
          <ul className="presence" aria-label="Weitere Bearbeiter">
            {collaborators.map((collaborator) => (
              <li
                key={collaborator.clientId}
                className={`presence__user presence__user--${collaborator.user.colorIndex}`}
              >
                <span className="presence__dot" aria-hidden="true" />
                {collaborator.user.name}
              </li>
            ))}
          </ul>
        )}
      </div>

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

      <SheetGrid doc={doc} readOnly={readOnly} awareness={awareness} />
    </div>
  );
}

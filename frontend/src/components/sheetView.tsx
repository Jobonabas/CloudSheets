import { useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import SheetGrid from './sheetGrid';
import { sheetStatusLabel, type SheetDocStatus } from '../lib/sheetDoc';
import { useSheetDoc } from '../lib/sheetConnection';
import { useCollaborators } from '../lib/presence';

interface SheetViewState {
  title?: string;
}

interface SheetViewProps {
  apiUrl: string;
}

interface Banner {
  tone: 'offline' | 'pending';
  text: string;
}

function changeCount(count: number): string {
  return count === 1 ? '1 Änderung' : `${count} Änderungen`;
}

/**
 * Leitet das Banner aus dem tatsaechlichen Zustand ab, ohne eigenen Zustand.
 *
 * Es gibt bewusst keine Meldung "wieder verbunden", die nach ein paar Sekunden
 * verschwindet. Die haette einen Zeitgeber und ein Merkmal gebraucht, das den
 * vorherigen Zustand festhaelt - und sie sagt weniger als das, was ohnehin zu
 * sehen ist: Das Abzeichen steht wieder auf "Verbunden" und der Zaehler der
 * offenen Aenderungen faellt auf null.
 */
function connectionBanner(status: SheetDocStatus, pendingChanges: number): Banner | null {
  if (status === 'disconnected') {
    return {
      tone: 'offline',
      text: pendingChanges > 0
        ? `Keine Verbindung zum Server. ${changeCount(pendingChanges)} warten auf die Übertragung — sie gehen nicht verloren und werden nachgeholt, sobald die Verbindung wieder steht.`
        : 'Keine Verbindung zum Server. Du kannst weiterarbeiten; deine Eingaben werden übertragen, sobald die Verbindung wieder steht.',
    };
  }

  // Beim ersten Laden ist der Zustand ebenfalls 'connecting', dann steht der
  // Zaehler aber auf 0 und es erscheint nichts.
  if (pendingChanges > 0) {
    return {
      tone: 'pending',
      text: status === 'connected'
        ? `${changeCount(pendingChanges)} werden übertragen …`
        : `Verbindung wird wiederhergestellt — ${changeCount(pendingChanges)} werden übertragen.`,
    };
  }

  return null;
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
  const banner = connectionBanner(status, pendingChanges);

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

      {/* Ohne Verbindung sieht die Tabelle aus wie immer, nur kommt nichts an und
          geht nichts raus. Das muss dastehen, sonst haelt man sie fuer gespeichert.
          aria-live, damit auch ein Screenreader den Wechsel mitbekommt. */}
      {banner && (
        <div className={`banner banner--${banner.tone}`} role="status" aria-live="polite">
          {banner.text}
        </div>
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

      <SheetGrid doc={doc} readOnly={readOnly} awareness={awareness} />
    </div>
  );
}

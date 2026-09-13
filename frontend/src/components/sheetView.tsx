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

/** Text shown next to the status badge while the connection is down. */
function offlineText(pendingChanges: number): string {
  if (pendingChanges === 0) return 'Änderungen werden nachgeholt';
  if (pendingChanges === 1) return '1 Änderung wartet auf Übertragung';
  return `${pendingChanges} Änderungen warten auf Übertragung`;
}

export default function SheetView({ apiUrl }: SheetViewProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // Passed along in router state by the overview. Missing on a direct link or after a
  // reload, then the ID stays as the heading.
  const title = (location.state as SheetViewState | null)?.title;

  // useLocalSheetDoc(id) from ../lib/sheetDoc is the offline fallback, same shape.
  const { doc, status, readOnly, awareness, pendingChanges } = useSheetDoc(id, apiUrl);
  const collaborators = useCollaborators(awareness);

  const goBack = useCallback(() => { navigate('/'); }, [navigate]);

  return (
    // sheet-page lifts the width limit of the main column, see index.css.
    <div className="sheet-page">
      <div className="page-head">
        <div className="page-head__title">
          <button type="button" className="btn btn--outline" onClick={goBack}>
            &larr; Übersicht
          </button>
          <h1>{title ?? id}</h1>
          {/* Always rendered and only changing colour, so the layout never shifts. */}
          <span className={`status status--${status}`} role="status" aria-live="polite">
            {sheetStatusLabel(status)}
          </span>

          {/* In the title row rather than above the grid, where it would shift the
              layout on every outage. Only on 'disconnected': while connected the
              counter is back to zero within milliseconds. */}
          {status === 'disconnected' && (
            <span className="offline-note">{offlineText(pendingChanges)}</span>
          )}
        </div>

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

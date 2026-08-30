import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { HocuspocusProvider, WebSocketStatus } from '@hocuspocus/provider';
import * as Y from 'yjs';
import { useSession } from '../auth/session';
import { displayName, publishUser } from './presence';
import {
  INITIAL_ROW_COUNT,
  countRows,
  ensureRows,
  type SheetDocState,
  type SheetDocStatus,
} from './sheetDoc';

/**
 * Verbindung eines Sheets zum Hocuspocus-Server.
 *
 * Das Dokument selbst und alles, was seine Struktur betrifft, liegt in
 * ./sheetDoc. Hier geht es nur darum, wo es herkommt: statt aus einem lokalen
 * new Y.Doc() aus einem HocuspocusProvider, der es ueber einen WebSocket mit
 * dem Server und allen anderen Sitzungen abgleicht.
 */

/**
 * Wie lange eine Verbindung nach dem Verlassen der Ansicht offen bleibt.
 *
 * Ohne diese Schonfrist waere die Verbindung unter StrictMode nicht zu halten:
 * React haengt jede Komponente einmal zusaetzlich aus und wieder ein, der Socket
 * wuerde also bei jedem Betreten der Seite sofort wieder geschlossen. Die Frist
 * ueberbrueckt das und nebenbei den kurzen Weg Uebersicht -> Sheet -> Uebersicht,
 * ohne dafuer jedes Mal neu zu verbinden.
 */
const RELEASE_DELAY_MS = 5000;

/**
 * Parameter fuer den Wiederverbindungsversuch (#48).
 *
 * Der Provider verbindet auch ohne diesen Block neu - unbegrenzt oft und mit
 * Streuung, das ist bereits sein Standard. Was hier abweicht, ist die
 * Geschwindigkeit der Erholung; alles andere steht der Vollstaendigkeit halber
 * dabei, damit niemand die Werte in node_modules nachschlagen muss.
 *
 * Gegenueber den Standardwerten geaendert:
 *
 *   factor                   2   -> 1.5     langsamer wachsende Abstaende
 *   maxDelay             30 000  -> 10 000  laengste Wartezeit ein Drittel
 *   minDelay              1 000  -> 500     untere Grenze der Streuung
 *   messageReconnectTimeout 30 000 -> 20 000 stumme Leitung faellt frueher auf
 *
 * maxDelay ist der Wert, der sich bemerkbar macht: Bei einem laengeren Ausfall
 * wartete ein Client nach dem Standard bis zu 30 Sekunden zwischen zwei
 * Versuchen. So lange sieht niemand auf eine tote Tabelle, ohne die Seite neu zu
 * laden - und genau das schliesst das Akzeptanzkriterium aus.
 */
const RECONNECT = {
  /** Erster Versuch sofort - eine kurze Stoerung soll man gar nicht bemerken. */
  initialDelay: 0,
  /** Danach eine Sekunde, und mit jedem Fehlschlag das Anderthalbfache. */
  delay: 1000,
  factor: 1.5,
  /** Obergrenze fuer den Abstand zwischen zwei Versuchen. */
  maxDelay: 10000,
  /**
   * Streuung, damit nicht alle Clients gleichzeitig anklopfen. Nach einem
   * Neustart des Backends haengen sonst alle im selben Takt und treffen es
   * gemeinsam in derselben Millisekunde.
   */
  jitter: true,
  minDelay: 500,
  /**
   * Nie aufgeben. Ein Wert groesser 0 hiesse: nach n Versuchen bleibt die
   * Tabelle still stehen und nur ein Neuladen hilft.
   */
  maxAttempts: 0,
  /**
   * Wann eine stumme Leitung als tot gilt. Bei Funkloechern und schlafenden
   * Laptops wird der Socket nie sauber geschlossen - ohne diese Frist merkte der
   * Client den Ausfall gar nicht und faenge nie an, neu zu verbinden.
   */
  messageReconnectTimeout: 20000,
} as const;

interface ConnectionSnapshot {
  status: SheetDocStatus;
  readOnly: boolean;
  /**
   * Zahl der Aenderungen, die noch beim Server ankommen muessen.
   *
   * Yjs sammelt sie waehrend einer Trennung im Dokument und schickt sie beim
   * Wiederverbinden nach. Ohne diese Zahl waere "wird uebertragen, sobald die
   * Verbindung steht" eine Behauptung, die niemand ueberpruefen kann.
   */
  pendingChanges: number;
}

interface Connection {
  doc: Y.Doc;
  provider: HocuspocusProvider;
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => ConnectionSnapshot;
  /** Zahl der eingehaengten Ansichten. Faellt sie auf 0, laeuft die Schonfrist an. */
  refs: number;
  releaseTimer: number | undefined;
}

const connections = new Map<string, Connection>();

/**
 * Baut die WebSocket-Adresse aus der API-Adresse: http wird ws, https wird wss.
 * Der Pfad ist die Route aus backend/src/routes/sheets-ws.ts.
 */
function syncUrl(apiUrl: string, sheetId: string): string {
  const url = new URL(`/sheets/${encodeURIComponent(sheetId)}/sync`, apiUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function toStatus(status: WebSocketStatus): SheetDocStatus {
  switch (status) {
    case WebSocketStatus.Connected:
      return 'connected';
    case WebSocketStatus.Disconnected:
      return 'disconnected';
    default:
      return 'connecting';
  }
}

function createConnection(url: string, sheetId: string, token: string, userName: string): Connection {
  const doc = new Y.Doc({ guid: sheetId });
  const listeners = new Set<() => void>();

  let snapshot: ConnectionSnapshot = { status: 'connecting', readOnly: false, pendingChanges: 0 };
  // Eine abgelehnte Anmeldung ist endgueltig, der Socket meldet danach aber weiter
  // seine Zustaende. Ohne dieses Merkmal wuerde 'Kein Zugriff' sofort wieder von
  // einem 'Verbinde ...' ueberschrieben und niemand erfuehre den Grund.
  let rejected = false;

  const update = (patch: Partial<ConnectionSnapshot>) => {
    const next = { ...snapshot, ...patch };
    if (
      next.status === snapshot.status &&
      next.readOnly === snapshot.readOnly &&
      next.pendingChanges === snapshot.pendingChanges
    ) {
      return;
    }
    snapshot = next;
    for (const listener of listeners) listener();
  };

  const provider = new HocuspocusProvider({
    url,
    // Der Dokumentname kommt aus dieser Option, nicht aus dem Pfad der URL - der
    // Server liest ihn aus der ersten Nachricht. Er muss die Sheet-UUID sein,
    // sonst findet onLoadDocument die Zeile in der Tabelle sheets nicht.
    name: sheetId,
    document: doc,
    // verifyUser() im Backend schneidet ein "Bearer "-Praefix ab und lehnt alles
    // andere ab. Der Provider schickt den Token roh, deshalb das Praefix hier.
    // Faellt weg, sobald verifyUser auch nackte Token annimmt.
    token: `Bearer ${token}`,

    // Wiederverbindung: siehe RECONNECT oben. Diese Optionen gehen an den
    // WebSocket unter dem Provider, den er sich aus der url selbst anlegt.
    ...RECONNECT,

    onStatus: ({ status }) => {
      if (rejected) return;
      update({ status: toStatus(status) });
    },
    // Meldet, wie viele Aenderungen noch nicht beim Server sind. Waehrend einer
    // Trennung waechst die Zahl mit jeder Eingabe und faellt beim Nachliefern
    // wieder auf 0 - daran sieht man, dass nichts verloren gegangen ist.
    onUnsyncedChanges: ({ number }) => { update({ pendingChanges: number }); },
    // Der Server bestaetigt mit der Anmeldung den Umfang der Rechte. 'readonly'
    // entspricht der Viewer-Rolle, deren Aenderungen onChange still verwirft.
    onAuthenticated: ({ scope }) => { update({ readOnly: scope === 'readonly' }); },
    onAuthenticationFailed: () => {
      rejected = true;
      update({ status: 'unauthorized' });
    },
    onSynced: ({ state }) => {
      if (!state) return;
      seedIfEmpty(doc, snapshot.readOnly);
    },
  });

  // Wer man ist, steht sofort fest und aendert sich nicht mehr. Die Cursorposition
  // meldet spaeter die Tabelle, sobald jemand eine Zelle anklickt.
  //
  // Awareness bewusst nicht abgeschaltet: Der Provider braucht sie ohnehin fuer
  // seine Verbindungspruefung, und ohne sie gaebe es keine Anwesenheit.
  if (provider.awareness) {
    publishUser(provider.awareness, userName);
  }

  const connection: Connection = {
    doc,
    provider,
    subscribe: (onStoreChange) => {
      listeners.add(onStoreChange);
      return () => { listeners.delete(onStoreChange); };
    },
    getSnapshot: () => snapshot,
    refs: 0,
    releaseTimer: undefined,
  };

  return connection;
}

/**
 * Legt die Startzeilen an, aber erst nachdem der Serverstand eingetroffen ist.
 *
 * Vor dem Abgleich ist das Dokument immer leer - wer hier schon Zeilen anlegt,
 * schiebt sie beim naechsten Update vor den echten Inhalt. Zwei Clients, die ein
 * frisches Sheet im selben Moment zum ersten Mal oeffnen, koennen beide seeden
 * und kaemen auf doppelte Leerzeilen; das ist ein schmales Fenster und kostet
 * nur ein paar leere Zeilen, deshalb bleibt es unbehandelt.
 */
function seedIfEmpty(doc: Y.Doc, readOnly: boolean): void {
  // Ein Viewer darf nicht schreiben - der Server wuerde die Zeilen verwerfen und
  // die Ansicht zeigte Zeilen, die es nirgends gibt.
  if (readOnly) return;
  if (countRows(doc) > 0) return;
  ensureRows(doc, INITIAL_ROW_COUNT);
}

/**
 * Holt die Verbindung zu einem Sheet oder legt sie an.
 *
 * Bewusst ohne Zaehlerschritt: die Funktion laeuft im Render und muss deshalb
 * gefahrlos mehrfach aufrufbar sein. Das Ein- und Aushaengen zaehlen retain und
 * release, und die laufen ausschliesslich im Effekt.
 */
function getConnection(url: string, sheetId: string, token: string, userName: string): Connection {
  const existing = connections.get(url);
  if (existing) return existing;

  const created = createConnection(url, sheetId, token, userName);
  connections.set(url, created);
  // Falls diese Ansicht nie eingehaengt wird - React darf ein Render verwerfen -
  // raeumt die Schonfrist die Verbindung von selbst wieder ab.
  armRelease(created, url);
  return created;
}

function armRelease(connection: Connection, url: string): void {
  connection.releaseTimer = window.setTimeout(() => {
    connection.releaseTimer = undefined;
    if (connection.refs > 0) return;
    connection.provider.destroy();
    connections.delete(url);
  }, RELEASE_DELAY_MS);
}

function retain(url: string): void {
  const connection = connections.get(url);
  if (!connection) return;

  if (connection.releaseTimer !== undefined) {
    window.clearTimeout(connection.releaseTimer);
    connection.releaseTimer = undefined;
  }
  connection.refs += 1;
}

function release(url: string): void {
  const connection = connections.get(url);
  if (!connection) return;

  connection.refs -= 1;
  if (connection.refs > 0 || connection.releaseTimer !== undefined) return;
  armRelease(connection, url);
}

/**
 * Liefert das Dokument eines Sheets samt Verbindungszustand.
 *
 * Gegenstueck zu useLocalSheetDoc aus #45 und mit derselben Rueckgabe, damit
 * sheetView.tsx zwischen beiden nur den Aufruf tauschen muss.
 *
 * Im Ticket heisst der Hook useCollaboration; ich bin beim Namen aus der
 * Schnittstellenabsprache geblieben, damit er zu useLocalSheetDoc und
 * useSheetRows passt.
 */
export function useSheetDoc(sheetId: string | undefined, apiUrl: string): SheetDocState {
  const { accessToken, email, userId } = useSession();

  const name = sheetId ?? 'kein-sheet';
  const url = useMemo(() => syncUrl(apiUrl, name), [apiUrl, name]);
  // Der Name aus der Sitzung, nicht direkt aus Cognito: useSession kapselt auch
  // den Dev-Bypass, sonst haette man lokal keinen Namen anzuzeigen.
  const userName = useMemo(() => displayName(email, userId), [email, userId]);

  // Token und Name gehen nur in die erste Anlage ein: getConnection schluesselt auf
  // die URL, eine Erneuerung im laufenden Betrieb gibt also die bestehende
  // Verbindung zurueck. Sie abzureissen und mitten in der Bearbeitung ein neues
  // Dokument aufzubauen waere schlimmer als ein Socket mit dem alten Token.
  const connection = useMemo(
    () => getConnection(url, name, accessToken ?? '', userName),
    [url, name, accessToken, userName],
  );

  useEffect(() => {
    retain(url);
    return () => { release(url); };
  }, [url]);

  const snapshot = useSyncExternalStore(connection.subscribe, connection.getSnapshot);

  return {
    doc: connection.doc,
    status: snapshot.status,
    readOnly: snapshot.readOnly,
    awareness: connection.provider.awareness,
    pendingChanges: snapshot.pendingChanges,
  };
}

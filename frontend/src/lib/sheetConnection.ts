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
 * Connection of a sheet to the Hocuspocus server. The document and its structure live
 * in ./sheetDoc; this module only supplies it from a HocuspocusProvider that syncs it
 * over a WebSocket instead of from a local new Y.Doc().
 */

/**
 * How long a connection stays open after the view unmounts. Without it StrictMode's
 * extra unmount/remount would close the socket on every page entry; it also covers the
 * short trip overview -> sheet -> overview.
 */
const RELEASE_DELAY_MS = 5000;

/**
 * Grace period before a lost connection is shown, so a hiccup the next attempt fixes
 * does not flash. Shorter than `delay` below, so a real outage still shows at once.
 */
const OFFLINE_GRACE_MS = 1200;

/** The same for the initial connect, longer: a failed first attempt is still startup. */
const FIRST_CONNECT_GRACE_MS = 6000;

/**
 * Reconnect parameters (#48). The provider already retries indefinitely with jitter;
 * what changes here is the speed of recovery. The remaining values are spelled out so
 * they need not be looked up in node_modules.
 *
 *   factor                    2      -> 1.5
 *   maxDelay              30 000     -> 10 000
 *   minDelay               1 000     -> 500
 *   messageReconnectTimeout 30 000   -> 20 000
 *
 * maxDelay is the one that matters: the default left a client waiting up to 30 seconds
 * between attempts, which the acceptance criterion rules out.
 */
const RECONNECT = {
  /** First attempt immediately, so a short glitch goes unnoticed. */
  initialDelay: 0,
  /** Then one second, multiplied by one and a half on every failure. */
  delay: 1000,
  factor: 1.5,
  maxDelay: 10000,
  /** Spread, so clients do not all reconnect in the same millisecond after a restart. */
  jitter: true,
  minDelay: 500,
  /** 0 = never give up; anything else leaves the grid dead until a reload. */
  maxAttempts: 0,
  /**
   * When a silent link counts as dead. On sleeping laptops and in dead spots the socket
   * is never closed cleanly, so nothing else would trigger a reconnect.
   */
  messageReconnectTimeout: 20000,
} as const;

interface ConnectionSnapshot {
  status: SheetDocStatus;
  readOnly: boolean;
  /**
   * Changes that still have to reach the server. Yjs collects them in the document
   * while disconnected and sends them on reconnect.
   */
  pendingChanges: number;
}

interface Connection {
  doc: Y.Doc;
  provider: HocuspocusProvider;
  dispose: () => void;
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => ConnectionSnapshot;
  /** Number of mounted views. Once it drops to 0 the grace period starts. */
  refs: number;
  releaseTimer: number | undefined;
}

const connections = new Map<string, Connection>();

/** http -> ws, https -> wss. The path is the route from backend/src/routes/sheets-ws.ts. */
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
  // A rejected login is final, but the socket keeps reporting states afterwards and
  // would overwrite 'unauthorized' with the next 'connecting'.
  let rejected = false;
  // Once the connection stood, a running attempt is no longer worth a message.
  let everConnected = false;
  let statusTimer: number | undefined;

  const clearStatusTimer = () => {
    if (statusTimer === undefined) return;
    window.clearTimeout(statusTimer);
    statusTimer = undefined;
  };

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

  /**
   * Smooths the connection state for display. The provider reports every reconnect
   * attempt, so during an outage it alternates between connecting and disconnected
   * about once a second; for the display both are the same state.
   */
  const showStatus = (next: SheetDocStatus) => {
    if (rejected) return;

    if (next === 'connected') {
      everConnected = true;
      clearStatusTimer();
      update({ status: 'connected' });
      return;
    }

    // Already shown or on its way: the next failed attempt changes nothing.
    if (snapshot.status === 'disconnected' || statusTimer !== undefined) return;

    statusTimer = window.setTimeout(() => {
      statusTimer = undefined;
      update({ status: 'disconnected' });
    }, everConnected ? OFFLINE_GRACE_MS : FIRST_CONNECT_GRACE_MS);
  };

  const provider = new HocuspocusProvider({
    url,
    // Read by the server from the first message, not from the URL path. Has to be the
    // sheet UUID, or onLoadDocument does not find the row in the sheets table.
    name: sheetId,
    document: doc,
    // verifyUser() strips a "Bearer " prefix and rejects anything else; the provider
    // sends the token raw. Can go once verifyUser accepts bare tokens.
    token: `Bearer ${token}`,

    // See RECONNECT above. These reach the WebSocket the provider creates from the url.
    ...RECONNECT,

    onStatus: ({ status }) => { showStatus(toStatus(status)); },
    // Grows with every input while disconnected, back to 0 once the changes are flushed.
    onUnsyncedChanges: ({ number }) => { update({ pendingChanges: number }); },
    // 'readonly' is the viewer role, whose changes the server discards in onChange.
    onAuthenticated: ({ scope }) => { update({ readOnly: scope === 'readonly' }); },
    onAuthenticationFailed: () => {
      clearStatusTimer();
      rejected = true;
      update({ status: 'unauthorized' });
    },
    onSynced: ({ state }) => {
      if (!state) return;
      seedIfEmpty(doc, snapshot.readOnly);
    },
  });

  // Awareness stays on: the provider uses it for its own connection check, and
  // presence depends on it. The cursor position is published later by the grid.
  if (provider.awareness) {
    publishUser(provider.awareness, userName);
  }

  const connection: Connection = {
    doc,
    provider,
    dispose: () => {
      clearStatusTimer();
      provider.destroy();
    },
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
 * Creates the initial rows, but only once the server state has arrived -- before the
 * sync the document is always empty and rows created here would precede the real
 * content. Two clients seeding the same fresh sheet at once can duplicate blank rows;
 * the window is narrow and left unhandled.
 */
function seedIfEmpty(doc: Y.Doc, readOnly: boolean): void {
  // The server would discard a viewer's rows, leaving a view of rows that do not exist.
  if (readOnly) return;
  if (countRows(doc) > 0) return;
  ensureRows(doc, INITIAL_ROW_COUNT);
}

/**
 * Returns the connection for a sheet, creating it if there is none. Runs during render
 * and therefore counts no references; retain and release do that in the effect.
 */
function getConnection(url: string, sheetId: string, token: string, userName: string): Connection {
  const existing = connections.get(url);
  if (existing) return existing;

  const created = createConnection(url, sheetId, token, userName);
  connections.set(url, created);
  // React may discard a render: if this view never mounts, the grace period cleans up.
  armRelease(created, url);
  return created;
}

function armRelease(connection: Connection, url: string): void {
  connection.releaseTimer = window.setTimeout(() => {
    connection.releaseTimer = undefined;
    if (connection.refs > 0) return;
    connection.dispose();
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
 * A sheet's document together with its connection state. Same return shape as
 * useLocalSheetDoc (#45), so sheetView.tsx only swaps the call.
 *
 * The ticket calls this hook useCollaboration; the name from the interface agreement
 * was kept to match useLocalSheetDoc and useSheetRows.
 */
export function useSheetDoc(sheetId: string | undefined, apiUrl: string): SheetDocState {
  const { accessToken, email, userId } = useSession();

  const name = sheetId ?? 'kein-sheet';
  const url = useMemo(() => syncUrl(apiUrl, name), [apiUrl, name]);
  // From the session, not from Cognito directly -- useSession also covers the bypass.
  const userName = useMemo(() => displayName(email, userId), [email, userId]);

  // Token and name only feed the initial creation; getConnection keys on the URL.
  // Rebuilding the document mid-edit would be worse than a socket with the old token.
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

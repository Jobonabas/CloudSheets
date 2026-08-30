import { useAuth } from 'react-oidc-context';

/**
 * Lokaler Entwicklungsschalter, der den Cognito-Login ueberspringt.
 *
 * Zwei Bedingungen muessen gleichzeitig erfuellt sein:
 *   1. VITE_DEV_AUTH_BYPASS=true in frontend/.env.local (nicht eingecheckt)
 *   2. import.meta.env.DEV, also der Vite-Dev-Server
 *
 * Punkt 2 ist die eigentliche Absicherung: bei `vite build` ist DEV konstant false,
 * die Bedingung faellt auf `false` zusammen und der gesamte Bypass-Zweig wird aus dem
 * Bundle entfernt. Selbst mit gesetzter Variable kann er in einem Deploy nicht aktiv
 * werden. Passend dazu muss das Backend mit NODE_ENV=test und AUTH_BYPASS=true laufen,
 * sonst weist es den Dummy-Token zurueck.
 */
export const DEV_AUTH_BYPASS =
  import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH_BYPASS === 'true';

// Muss zum Seed in backend/seeds/development/01_demo_user.ts passen, damit das
// Backend die Sheets demselben Nutzer zuordnet, den das Frontend als Eigentuemer
// ansieht - sonst fehlt in der Uebersicht der Loeschen-Button.
const DEV_USER_ID = 'demo-user-id';
const DEV_USER_EMAIL = 'demo@example.com';

export interface Session {
  isLoading: boolean;
  errorMessage?: string;
  isAuthenticated: boolean;
  accessToken?: string;
  userId?: string;
  email?: string;
  signIn: () => void;
  signOut: () => void;
}

/**
 * Einziger Zugriffspunkt auf den Anmeldezustand. Komponenten nutzen diesen Hook statt
 * useAuth() direkt, damit der Dev-Bypass an genau einer Stelle sitzt.
 */
export function useSession(): Session {
  const auth = useAuth();

  if (DEV_AUTH_BYPASS) {
    return {
      isLoading: false,
      isAuthenticated: true,
      // Inhalt egal: verifyUser() gibt bei AUTH_BYPASS den Demo-Nutzer zurueck,
      // bevor der Token ueberhaupt geprueft wird.
      accessToken: 'dev-bypass-token',
      userId: DEV_USER_ID,
      email: DEV_USER_EMAIL,
      signIn: () => {},
      signOut: () => {},
    };
  }

  return {
    isLoading: auth.isLoading,
    errorMessage: auth.error?.message,
    isAuthenticated: auth.isAuthenticated,
    accessToken: auth.user?.access_token,
    userId: auth.user?.profile.sub,
    email: auth.user?.profile.email,
    signIn: () => { void auth.signinRedirect(); },
    signOut: () => { void auth.removeUser(); },
  };
}

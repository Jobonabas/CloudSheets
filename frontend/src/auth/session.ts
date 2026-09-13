import { useAuth } from 'react-oidc-context';

/**
 * Skips the Cognito login in local development. Needs VITE_DEV_AUTH_BYPASS=true in
 * frontend/.env.local (not checked in) and import.meta.env.DEV.
 *
 * DEV is the safeguard: `vite build` makes it a constant false, so the branch is
 * dropped from the bundle and cannot be enabled in a deployment. The backend has to
 * run with NODE_ENV=test and AUTH_BYPASS=true to accept the dummy token.
 */
export const DEV_AUTH_BYPASS =
  import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH_BYPASS === 'true';

// Has to match backend/seeds/development/01_demo_user.ts, otherwise the backend
// assigns sheets to a different user than the frontend treats as the owner.
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

/** Single entry point to the auth state, so the dev bypass lives in one place. */
export function useSession(): Session {
  const auth = useAuth();

  if (DEV_AUTH_BYPASS) {
    return {
      isLoading: false,
      isAuthenticated: true,
      // Never verified: with AUTH_BYPASS, verifyUser() returns the demo user.
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

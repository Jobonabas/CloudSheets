import { useAuth } from "react-oidc-context";
import Overview from "./components/overview";

interface AppConfig {
  clientId: string;
  logoutUrl: string;
  cognitoDomain: string;
  apiUrl: string; // NEU
}
interface AppProps {
  config: AppConfig;
}

function App({ config }: AppProps) {
  const auth = useAuth();

  const signOutRedirect = () => {
    const clientId = config.clientId;
    const logoutUri = config.logoutUrl;
    const cognitoDomain = config.cognitoDomain;
    window.location.href = `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
  };

  if (auth.isLoading) {
    return <div>Loading...</div>;
  }

  if (auth.error) {
    return <div>Encountering error... {auth.error.message}</div>;
  }

  if (auth.isAuthenticated) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem' }}>
          <span>Hello: {auth.user?.profile.email}</span>
          <button onClick={() => auth.removeUser()}>Sign out</button>
        </div>
        <Overview apiUrl={config.apiUrl} /> {/* NEU: statt der Token-Debug-Ausgabe */}
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => auth.signinRedirect()}>Sign in</button>
      <button onClick={() => signOutRedirect()}>Sign out</button>
    </div>
  );
}

export default App;
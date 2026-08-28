import { Navigate, Route, Routes } from "react-router-dom";
import { useSession } from "./auth/session";
import Overview from "./components/overview";
import SheetView from "./components/sheetView";

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
  const session = useSession();

  const signOutRedirect = () => {
    const clientId = config.clientId;
    const logoutUri = config.logoutUrl;
    const cognitoDomain = config.cognitoDomain;
    window.location.href = `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
  };

  if (session.isLoading) {
    return <div>Loading...</div>;
  }

  if (session.errorMessage) {
    return <div>Encountering error... {session.errorMessage}</div>;
  }

  if (session.isAuthenticated) {
    return (
      <>
        <header className="app-header">
          <span className="app-header__brand">CloudSheets</span>
          <span className="app-header__user">
            {session.email}
            <button className="btn btn--on-dark" onClick={session.signOut}>Abmelden</button>
          </span>
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Overview apiUrl={config.apiUrl} />} />
            <Route path="/sheet/:id" element={<SheetView apiUrl={config.apiUrl} />} />
            {/* Cognito leitet immer auf "/" zurueck; alles andere ist ein veralteter
                oder vertippter Link und landet auf der Uebersicht statt auf leer. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </>
    );
  }

  return (
    <>
      <header className="app-header">
        <span className="app-header__brand">CloudSheets</span>
      </header>
      <main className="app-main">
        <div className="toolbar">
          <button className="btn btn--primary" onClick={session.signIn}>Anmelden</button>
          <button className="btn btn--outline" onClick={() => signOutRedirect()}>Abmelden</button>
        </div>
      </main>
    </>
  );
}

export default App;
// main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "react-oidc-context";
import { BrowserRouter } from "react-router-dom";
import { DEV_AUTH_BYPASS } from "./auth/session";
import "./index.css";

interface AppConfig {
  authority: string;
  clientId: string;
  callbackUrl: string;
  logoutUrl: string;
  cognitoDomain: string;
  apiUrl: string;
}

// Im Deploy schreibt die CDK diese Datei in den S3-Bucket (siehe FrontendStack).
// Absoluter Pfad: relativ wuerde er auf /sheet/:id zu /sheet/config.json aufgeloest,
// und CloudFront beantwortet unbekannte Pfade mit index.html und Status 200. Der
// Fetch waere also "erfolgreich" und erst das JSON.parse wuerde scheitern.
async function loadRemoteConfig(): Promise<AppConfig> {
  const response = await fetch('/config.json');
  if (!response.ok){
    throw new Error(`Config Status: ${response.status}`)
  }

  const config = await response.json();
  if (!config.authority || !config.clientId){
    throw new Error("Konfigurationsdatei unvollständig");
  }
  return config;
}

// Lokal gibt es weder CloudFront noch Cognito und damit keine config.json. Die
// Cognito-Felder sind Platzhalter: im Bypass wird nie ein Login ausgeloest.
function devConfig(): AppConfig {
  const origin = window.location.origin;
  return {
    authority: `${origin}/dev-bypass`,
    clientId: 'dev-bypass',
    callbackUrl: origin,
    logoutUrl: origin,
    cognitoDomain: `${origin}/dev-bypass`,
    apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:8080',
  };
}

async function init() {
try{

  const config = DEV_AUTH_BYPASS ? devConfig() : await loadRemoteConfig();

  const cognitoAuthConfig = {
  authority: config.authority,
  client_id: config.clientId,
  redirect_uri: config.callbackUrl,
  response_type: "code",
  scope: "openid email profile",
};

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

root.render(
  <React.StrictMode>
    <AuthProvider {...cognitoAuthConfig}>
      <BrowserRouter>
        <App config={config} />
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);



} catch {
  const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
  root.render(
      <div style={{ padding: '20px', color: 'red', fontFamily: 'sans-serif' }}>
        <h1>Verbindungsfehler</h1>
        <p>Die Anwendung konnte nicht geladen werden. Bitte versuchen Sie es später erneut.</p>
      </div>
  );
}

}

init();


/*
const cognitoAuthConfig = {
  authority: "https://cognito-idp.eu-north-1.amazonaws.com/eu-north-1_rF4JS7y9l",
  client_id: "5l7q2l2q5ic94jj0egcl9hccfk",
  redirect_uri: "https://d84l1y8p4kdic.cloudfront.net",
  response_type: "code",
  scope: "phone openid email",
};
*/


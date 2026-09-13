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

// Written into the S3 bucket by the CDK on deploy (see FrontendStack). The path has
// to be absolute: on /sheet/:id a relative one resolves to /sheet/config.json, which
// CloudFront answers with index.html and status 200.
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

// No CloudFront and no Cognito locally, so no config.json. The Cognito fields are
// placeholders; the bypass never triggers a login.
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


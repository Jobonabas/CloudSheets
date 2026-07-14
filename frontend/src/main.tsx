// main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "react-oidc-context";
async function init() {
try{

  const response = await fetch('config.json');
  if (!response.ok){
    throw new Error(`Config Status: ${response.status}`)
  }

  const config = await response.json();
  if (!config.authority || !config.clientId){
    throw new Error("Konfigurationsdatei unvollständig");
  }


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
      <App config={config} />
    </AuthProvider>
  </React.StrictMode>
);



}catch(error){
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


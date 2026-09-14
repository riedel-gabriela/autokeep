import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "react-oidc-context";
import { WebStorageStateStore } from "oidc-client-ts";
import { App } from "./App.js";
import { loadConfig } from "./config.js";
import "./styles.css";

async function start() {
  const config = await loadConfig();
  const root = createRoot(document.getElementById("root")!);
  root.render(
    <StrictMode>
      <AuthProvider
        authority={config.authority}
        client_id={config.clientId}
        redirect_uri={config.redirectUri}
        post_logout_redirect_uri={config.logoutUri}
        response_type="code"
        scope="openid email profile"
        userStore={new WebStorageStateStore({ store: window.sessionStorage })}
        onSigninCallback={() => window.history.replaceState({}, document.title, "/")}
      >
        <App config={config} />
      </AuthProvider>
    </StrictMode>,
  );
}

void start().catch(() => {
  createRoot(document.getElementById("root")!).render(
    <main className="fatal"><h1>AutoKeep</h1><p>Não foi possível carregar a configuração desta implantação.</p></main>,
  );
});

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => void navigator.serviceWorker.register("/sw.js"));
}

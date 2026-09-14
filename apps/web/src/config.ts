export interface RuntimeConfig {
  apiBaseUrl: string;
  authority: string;
  clientId: string;
  redirectUri: string;
  logoutUri: string;
}

export async function loadConfig(): Promise<RuntimeConfig> {
  const response = await fetch("/config.json", { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error("Configuração da aplicação indisponível");
  return response.json() as Promise<RuntimeConfig>;
}

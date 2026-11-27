// Only public URLs belong here. AWS secrets are never copied into browser variables.
export function developmentUrls(env = process.env) {
  if (env.CODESPACES !== 'true') {
    return { appOrigin: 'http://localhost:8080' };
  }
  const name = env.CODESPACE_NAME;
  const domain = env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  if (
    !name ||
    !/^[a-z0-9-]+$/.test(name) ||
    !domain ||
    !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(domain)
  ) {
    throw new Error('Codespaces: CODESPACE_NAME ou domínio de encaminhamento inválido.');
  }
  return {
    appOrigin: `https://${name}-8080.${domain}`,
  };
}

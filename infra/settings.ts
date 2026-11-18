export type SettingsInput = {
  stack: string;
  accountId: string;
  domainName?: string;
  enableDns?: boolean;
  hostedZoneId?: string;
  tableMode?: string;
  tableName?: string;
  siteTarget?: string;
  importTableId?: string;
};

function dnsName(value: string, label: string): string {
  const name = value.trim().toLowerCase().replace(/\.$/, '');
  if (name.length > 253 || !name.includes('.') || name.split('.').some(
    part => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part),
  )) throw new Error(`${label}: informe um nome DNS válido, sem protocolo, caminho ou wildcard.`);
  return name;
}

export function settings(input: SettingsInput) {
  if (!['dev', 'prod'].includes(input.stack)) throw new Error('Use somente as stacks dev ou prod.');
  if (!/^\d{12}$/.test(input.accountId)) throw new Error('accountId deve conter os 12 dígitos da conta AWS de destino.');
  const enableDns = input.enableDns ?? true;
  if (enableDns && !input.domainName) throw new Error('Informe domainName ou configure enableDns=false para provisionar somente o banco.');
  const domainName = input.domainName ? dnsName(input.domainName, 'domainName') : undefined;
  if (domainName && !domainName.startsWith(`${input.stack}.`)) throw new Error('domainName deve começar pelo ambiente: dev. ou prod.');
  const tableMode = input.tableMode ?? (input.stack === 'dev' ? 'reference' : 'create');
  if (!['reference', 'create', 'import'].includes(tableMode)) throw new Error('tableMode deve ser reference, create ou import.');
  const tableName = input.tableName ?? `autokeep-${input.stack}`;
  if (!/^[a-zA-Z0-9_.-]{3,255}$/.test(tableName) || !tableName.endsWith(`-${input.stack}`)) {
    throw new Error('tableName deve ser válido e terminar com o ambiente, como autokeep-dev.');
  }
  if (tableMode === 'import' && input.importTableId !== tableName) {
    throw new Error('Em modo import, importTableId deve ser igual ao nome da tabela confirmada na AWS.');
  }
  if (tableMode !== 'import' && input.importTableId) throw new Error('importTableId exige tableMode=import.');
  if (input.hostedZoneId && !/^Z[A-Z0-9]+$/.test(input.hostedZoneId)) throw new Error('hostedZoneId inválido.');
  const siteTarget = input.siteTarget ? dnsName(input.siteTarget, 'siteTarget') : undefined;
  const applicationDomain = domainName ? `app.${domainName}` : undefined;
  if (siteTarget && siteTarget === applicationDomain) throw new Error('siteTarget não pode apontar para o próprio registro app.');
  return { ...input, enableDns, domainName, tableMode, tableName, siteTarget, applicationDomain };
}

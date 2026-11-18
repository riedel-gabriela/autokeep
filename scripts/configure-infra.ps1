[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('dev', 'prod')][string]$Stack,
  [Parameter(Mandatory)][ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_-]*$')][string]$Organization,
  [Parameter(Mandatory)][ValidatePattern('^\d{12}$')][string]$AccountId,
  [string]$DomainName,
  [switch]$NoDns,
  [ValidateSet('reference', 'create', 'import')][string]$TableMode,
  [string]$HostedZoneId,
  [string]$SiteTarget,
  [string]$AwsProfile,
  [string]$Region = 'us-east-1'
)
$ErrorActionPreference = 'Stop'
if (-not $NoDns -and -not $DomainName) { throw 'Informe DomainName ou use -NoDns para configurar apenas o banco.' }
$infraPath = Join-Path $PSScriptRoot '..\infra'
if (-not (Get-Command pulumi -ErrorAction SilentlyContinue)) { throw 'Instale o Pulumi CLI e reabra o terminal.' }
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) { throw 'Instale o AWS CLI e reabra o terminal.' }

function Invoke-PulumiChecked {
  param([string[]]$CommandArguments)
  & pulumi -C $infraPath @CommandArguments
  if ($LASTEXITCODE -ne 0) { throw 'Comando Pulumi falhou. Corrija o erro antes de continuar.' }
}

# Não faz login, não aplica infraestrutura e não cria credenciais.
& pulumi whoami
if ($LASTEXITCODE -ne 0) { throw 'Execute pulumi login no backend desejado antes de configurar.' }
$identityArgs = @('sts', 'get-caller-identity', '--query', 'Account', '--output', 'text')
if ($AwsProfile) { $identityArgs += @('--profile', $AwsProfile) }
$actualAccount = & aws @identityArgs
if ($LASTEXITCODE -ne 0 -or "$actualAccount".Trim() -ne $AccountId) { throw 'A identidade AWS não corresponde à conta informada.' }

if (-not $TableMode) { $TableMode = if ($Stack -eq 'dev') { 'reference' } else { 'create' } }
Invoke-PulumiChecked -CommandArguments @('stack', 'select', "$Organization/autokeep/$Stack", '--create', '--non-interactive')
$values = @{
  'aws:region' = $Region
  'autokeep:accountId' = $AccountId
  'autokeep:enableDns' = $(if ($NoDns) { 'false' } else { 'true' })
  'autokeep:tableMode' = $TableMode
  'autokeep:tableName' = "autokeep-$Stack"
}
if ($DomainName) { $values['autokeep:domainName'] = $DomainName }
if ($AwsProfile) { $values['aws:profile'] = $AwsProfile }
if ($HostedZoneId) { $values['autokeep:hostedZoneId'] = $HostedZoneId }
if ($SiteTarget) { $values['autokeep:siteTarget'] = $SiteTarget }
if ($TableMode -eq 'import') { $values['autokeep:importTableId'] = "autokeep-$Stack" }
foreach ($entry in $values.GetEnumerator()) { Invoke-PulumiChecked -CommandArguments @('config', 'set', $entry.Key, $entry.Value, '--stack', "$Organization/autokeep/$Stack") }
if ($TableMode -ne 'import') { Invoke-PulumiChecked -CommandArguments @('config', 'rm', 'autokeep:importTableId', '--stack', "$Organization/autokeep/$Stack") }
Write-Output "Configuração concluída para $Stack. Revise infra/Pulumi.$Stack.yaml e execute pulumi -C infra preview --stack $Organization/autokeep/$Stack."
Write-Output 'Nenhum recurso AWS foi provisionado por este script.'

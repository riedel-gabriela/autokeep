# Validação da garagem pessoal

Revisão de 26/11/2026, branch refactor/personal-garage.

## Verificações executadas

- npm test: 12 testes aprovados, incluindo Google OAuth, state/replay,
  bloqueio do acesso dev em produção e regras de manutenção.
- npm run test:integration: aprovado com DynamoDB Local descartável nas
  origens localhost e Codespaces. Inclui isolamento, ciclo do veículo,
  leituras, óleo, histórico, auditoria, notificações e push simulado.
- npm run build, npm run build:lambda e npm run check na pasta Pulumi: aprovados.
- Docker local: página e login de desenvolvimento responderam com HTTP 200.
- Codespace real, porta privada 8080: botão Entrar abriu a garagem pessoal.
- AWS dev: página, sessão, veículo, leitura, óleo, histórico, notificações,
  auditoria e logout aprovados; veículo de teste arquivado.
- Produção: Google OAuth abriu a garagem existente. Cadastro de veículo,
  leitura, troca, recálculo, histórico e arquivamento foram executados.
  Os registros de teste foram arquivados, preservando a auditoria.
- Domínio de produção: frontend atual, HTTPS, API e delegação DNS confirmados.

## Encaminhamento privado do Codespace

O proxy observado reescreve Origin para https://localhost:8080. O servidor
aceita esse valor somente quando NODE_ENV=development, DEV_LOGIN_ENABLED=true,
CODESPACES=true, há endpoint de banco local e APP_ORIGIN aponta para
app.github.dev. A origem pública configurada continua aceita. Outras origens
são rejeitadas; produção e a Lambda dev não recebem essa exceção local.

A integração testa tanto o encaminhamento permitido quanto a rejeição em
localhost e de origens externas. O Compose passa a flag CODESPACES ao container.

## Repetir

    npm ci
    npm test
    npm run test:integration
    npm run build
    npm run build:lambda
    npm run dev

No Codespace, abra a porta 8080 em Ports, mantendo-a privada, e clique em
Entrar. Para parar o Docker e preservar dados locais, use npm run down.

A atualização AWS exige o preview e o procedimento do
[guia Pulumi](../pulumi-start-aws/README.md). E-mail real, push em aparelhos
físicos e rastreamento GPS não foram validados como entregas de produção.
Os scripts SAM foram ajustados, mas a suíte SAM não foi executada nesta revisão.

# Testes funcionais da API local

Data: 18/11/2026. Ambiente: API Lambda Node.js 24 executada pelo SAM no Docker,
com DynamoDB Local. Os testes acessam somente `127.0.0.1`, tabela `autokeep-local`
e credenciais fictícias. Nenhum deploy ou recurso AWS/Vercel é alterado.

## Reproduzir

Com Docker iniciado, na raiz do projeto:

```powershell
npm run sam:db
npm run sam:build
npm run sam:local
```

Em outro terminal:

```powershell
npm run sam:test:integration
```

O script `scripts/sam-integration.mjs` cria dados isolados por execução e executa
asserções HTTP com leitura direta do banco local para verificar persistência e
ausência de alterações em operações rejeitadas. Encerra com código diferente de
zero quando um cenário falha, permitindo uso futuro em CI.

## Cenários

| Grupo | Resultado exigido |
| --- | --- |
| Saúde | GET health retorna 200 e consulta o banco local |
| Sessão ausente/forjada | Retorno 401 |
| Senha incorreta | Login rejeitado com 401 |
| Login ADMIN | Identidade correta, cookie HttpOnly/SameSite Strict e validade de 12 horas |
| Login DRIVER | Associação DRIVER apenas na organização autorizada |
| Restauração da sessão | GET session recupera a identidade e o papel persistidos |
| Cadastro pelo ADMIN | 201 e veículo persistido na organização correta |
| Consulta pelo ADMIN | Detalhes e painel contêm o veículo cadastrado |
| Cadastro pelo DRIVER | 403 e quantidade de veículos inalterada |
| Veículo sem atribuição | DRIVER não vê no painel e recebe 404 em acesso direto |
| Isolamento entre organizações | ADMIN externo e DRIVER não acessam outro espaço |
| Atribuição | ADMIN atribui DRIVER, que passa a consultar o veículo |
| Leitura de odômetro | DRIVER atribuído registra; ADMIN e banco refletem o novo valor |
| Leitura inválida | Regressão, futuro e ordem invertida retornam 400 sem alterar odômetro |
| Operações administrativas | DRIVER não registra troca, arquiva, atribui, convida, remove membro ou consulta membros/auditoria |
| Troca inválida | Data futura ou km incoerente retornam 400 sem alterar ciclo/histórico |
| Troca válida | ADMIN inicia novo ciclo e preserva as leituras e trocas anteriores |
| Desatribuição | DRIVER perde visibilidade e o histórico permanece |
| Expiração | Sessão de teste expirada no banco retorna SESSION_EXPIRED/401 |
| Logout | Sessão encerrada retorna 401 mesmo com o cookie antigo |

A lista organiza os comportamentos; algumas linhas são verificadas no mesmo
cenário executável. O total final consta no relatório de execução.

## Resultado confirmado

Em 18/11/2026, após recompilar a correção de autorização, a suíte terminou com
**19 cenários aprovados e zero falhas**, passando por chamadas HTTP à Lambda
local e verificações de persistência no DynamoDB Docker. `npm run sam:build`
e `npm run build` também concluíram com sucesso.

O primeiro teste encontrou a falha de cadastro por motorista; a segunda execução
confirmou a regressão corrigida, incluindo ausência de gravação não autorizada.

## Falha encontrada e correção

A primeira execução aceitou cadastro de veículo por DRIVER (HTTP 201).
O requisito e o contrato atual restringem cadastro ao ADMIN. Foi adicionado o
middleware `admin` à rota POST de veículos em `src/server/cloud-app.ts` e
`src/server/app.ts`. A suíte contém regressão para exigir 403 e ausência de
gravação nesse caso.

## Dados e limites

Fixtures e resultados ficam em `sam/*.local.json`, ignorados pelo Git.
Contas usam domínio fictício `autokeep.local`; a senha aleatória não é exibida
no relatório versionado. Registros permanecem no volume local para inspeção.
Cada execução utiliza novos IDs e não remove dados existentes.

Esta etapa não valida a interface no navegador, entrega de e-mail, OAuth,
concorrência de gravações ou todos os fluxos de convite. Os cenários foram
executados contra o backend DynamoDB via SAM; o ajuste da rota MySQL recebe
verificação de tipos/build, mas não representa execução completa do backend
MySQL nesta etapa. Publicação AWS/Vercel ainda exige testes próprios.

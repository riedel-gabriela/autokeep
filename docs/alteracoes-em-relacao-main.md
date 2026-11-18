# Alterações em relação à main

Data: 18/11/2026.

Base da comparação: `main` no commit `ac69017438c754fbc9cd6337b4be52f421832e75`
(`feat: publish persistent autokeep app`). O documento descreve o conjunto de
alterações da branch `alterações-stacks`, incluindo os commits `5831e65` e
`e733438` e esta atualização documental.

## 1. Documentação da sprint 1

- Criada especificação atual em `docs/requisitos.md`, com requisitos funcionais,
  não funcionais, regras de negócio e rastreabilidade para o código.
- Criados `docs/casos-de-uso.md` e `docs/fluxogramas.md`.
- Atualizado `docs/architecture.md`, separando Docker/MySQL local,
  Vercel/DynamoDB documentado e arquitetura AWS ainda planejada.
- Atualizado `docs/openapi.yaml` para sessão em cookie e rotas atuais.
- Preservado o contrato Cognito anterior em `docs/openapi.legacy.yaml`.
- Ajustado `docs/openapi.local.yaml` e criado `docs/contratos-api.md` para
  explicar diferenças entre os backends, inclusive notificações provisórias.
- Incluído `docs/backend-aws-diagrama.md` com identificação de referência histórica.
- Atualizados README e documentação de implementação.

## 2. Planejamento das entregas

- Criado `docs/pendencias-sprints.md`: tarefas identificadas, critérios de
  conclusão, dependências e evidências por sprint.
- A conclusão documental não representa aceite do professor nem comprovação
  automática de todos os requisitos funcionais.

## 3. Infraestrutura Pulumi e stacks

- Criado projeto oficial em `infra/`, com `Pulumi.yaml`, programa TypeScript,
  configuração, dependências e lockfile próprios.
- Adicionadas configurações versionadas para `dev` e `prod`, sem chaves AWS.
- Criadas opções de criação, referência e importação de DynamoDB, com chaves
  `pk`/`sk`, nomes separados por ambiente e proteção contra exclusão.
- Implementada restrição à conta AWS configurada.
- Preparado DNS Route 53 opcional, zona existente/nova, identificação TXT e
  CNAME dependente do destino real da hospedagem.
- Implementado modo `enableDns=false`, para avançar sem domínio.
- Criado `scripts/configure-infra.ps1` para verificar identidade, registrar stack
  e salvar configuração sem aplicar recursos automaticamente.
- Criados testes de configuração, recursos com mocks, referência a dados
  existentes e execução somente de banco, sem DNS.
- Adicionado `infra/README.md` com procedimentos e limites.
- Identificado `pulumi-start-aws/` como exemplo histórico.

### Resultado externo registrado

Em 18/11/2026, foram registradas as stacks e provisionadas tabelas novas
`autokeep-dev` e `autokeep-prod` em `us-east-1`, na conta autenticada.
Ambas foram confirmadas como ACTIVE, com 5 RCU e 5 WCU por tabela.
Produção tem proteção adicional contra exclusão na AWS; ambas têm proteção
Pulumi. Evidências em `docs/infraestrutura-provisionada.md`.

O estado dos recursos permanece no backend Pulumi, fora do Git. Um clone deste
repositório não recebe credenciais nem executa provisionamento automaticamente.
Não houve migração do banco nem alteração da publicação Vercel.

## 4. API local com SAM

- Adicionado `template.yaml`, reutilizando `lambda/index.ts` com HTTP API
  payload 2.0, runtime Node.js 24 e build esbuild para `index.cjs`.
- Incluída dependência de desenvolvimento esbuild e atualizado o lockfile da aplicação.
- Adicionado `compose.sam.yaml`, com DynamoDB local e volume próprio,
  separado do MySQL original e das tabelas AWS.
- Criado `scripts/sam-db.mjs`, com endpoint/tabela locais fixos e inicialização
  idempotente que preserva dados existentes compatíveis.
- Criado `scripts/sam-local.mjs`, com credenciais fictícias limitadas ao
  subprocesso, sem alterar os perfis AWS reais.
- Adicionados evento `sam/events/health.json` e teste HTTP `scripts/sam-smoke.mjs`.
- Criado guia `docs/sam-local.md` e atualizadas as tarefas da sprint 3.

### Novos comandos npm

| Comando | Finalidade |
| --- | --- |
| `npm run sam:validate` | Validar template com lint |
| `npm run sam:build` | Compilar a função local |
| `npm run sam:db` | Iniciar DynamoDB Docker e preparar autokeep-local |
| `npm run sam:local` | Iniciar a API em localhost:3000 |
| `npm run sam:test` | Verificar saúde e rejeições de autenticação/origem |
| `npm run sam:test:integration` | Criar fixtures isoladas e testar fluxos e permissões pela API SAM |
| `npm run sam:down` | Parar o banco local preservando o volume |

### Testes funcionais e correção de autorização

- Criado `scripts/sam-integration.mjs`, com contas fictícias ADMIN, DRIVER e
  ADMIN de outra organização, dados isolados por execução e senha aleatória.
- Os 19 cenários aprovados cobrem login, cookies, restauração e expiração de
  sessão, logout, cadastro/consulta de veículos, atribuição, leituras, trocas
  de óleo e isolamento de permissões/organizações.
- Regressão de quilometragem, datas futuras e inconsistências de manutenção
  são rejeitadas sem alterar os dados verificados no banco local.
- Encontrada e corrigida falha que permitia a DRIVER cadastrar veículos:
  adicionado middleware ADMIN ao POST de veículos nas APIs MySQL e DynamoDB.
  O teste confirmou HTTP 403 e ausência de gravação pelo motorista.
- Fixtures e resultados ficam em `sam/*.local.json`, ignorados pelo Git.
- Evidências e limites em `docs/testes-api-local.md`. A suíte foi executada no
  caminho SAM/DynamoDB; não representa validação funcional completa do MySQL
  ou da interface no navegador.

## 4.1. Publicação da API de desenvolvimento na AWS

- Adicionado `infra/api.ts`, com Lambda, role IAM, política inline, grupo de
  logs, API Gateway HTTP, integração payload 2.0, permissão de invocação,
  rota proxy e estágio default.
- Publicação habilitada somente em dev com `autokeep:enableApi=true`;
  o código rejeita habilitação em prod nesta etapa.
- Função `autokeep-dev-api`: Node.js 24, handler `index.handler`, 512 MB e
  timeout de 30 segundos. Logs mantidos por 14 dias no grupo próprio.
- Role permite GetItem, PutItem, DeleteItem e Query somente na tabela
  `autokeep-dev`; logs limitados ao grupo da função. Não há chaves AWS estáticas
  nas variáveis da Lambda.
- Endpoint: <https://byy7qmnzsi.execute-api.us-east-1.amazonaws.com>.
- Rota: `ANY /api/{proxy+}`; limites do estágio: 5 requisições/s e burst 10.
- Sessão, organização e papel continuam validados pela aplicação; health é público.
  `APP_ORIGIN` aponta para a própria API e `SEED_DEMO=false`.
- Atualizado `scripts/build-lambda.mjs` para esbuild e compactação portátil
  com fflate, sem depender de zip externo ou PowerShell Archive.
- ZIP verificado: apenas `index.cjs`; Pulumi também empacota somente esse arquivo.
- Adicionados `infra/tests/api.test.ts` e `scripts/verify-dev-api.mjs`.
- Evidências em `docs/api-dev-publicada.md` e atualização do checklist das sprints.

### Resultado externo da publicação

Preview revisado: nove recursos adicionais e três existentes inalterados.
Aplicação concluída em dev; AWS confirmou função Active e atualização Successful.
O endpoint retornou health 200, sessão ausente 401, origem inválida 403 e login
inválido 401. Registros REPORT foram confirmados no CloudWatch.

A simulação IAM por recurso confirmou as quatro operações permitidas em dev e
implicitDeny em prod, sem ler/gravar dados de produção. Não foram criados dados
de negócio na nuvem para essa verificação. A stack prod manteve seus três
recursos e a data de atualização anterior. O frontend Vercel não foi alterado.

## 5. Arquivos ignorados e credenciais

- `.gitignore` inclui artefatos `.aws-sam/` e configuração local `samconfig.toml`.
- Dados, senhas fictícias e resultados de testes em `sam/*.local.json` também
  são ignorados; o relatório versionado contém somente cenários e evidências.
- Exceções permitem versionar `infra/Pulumi.dev.yaml` e `infra/Pulumi.prod.yaml`.
- Não são incluídos `.env`, tokens, credenciais AWS/Pulumi, `node_modules`,
  arquivos de build ou volumes Docker.
- Os arquivos de stack contêm ID da conta e nome do perfil local, que não são
  chaves de acesso. Outros desenvolvedores precisam configurar seus próprios
  perfis e autenticar no backend de estado autorizado.

## 6. Verificações já realizadas

- Conferência estrutural de 22 operações OpenAPI por backend, referências e links locais.
- `npm run check --prefix infra`: TypeScript aprovado.
- `npm test --prefix infra`: cinco testes aprovados, incluindo IAM, integração
  HTTP e credenciais de execução da API dev com mocks.
- Script PowerShell validado sintaticamente e com execução simulada.
- Preview real e aplicação Pulumi concluídos para as duas stacks.
- DescribeTable confirmou estado, capacidade, chaves e proteção das tabelas.
- `npm run sam:validate`: template válido com lint.
- `npm run sam:build`: compilação concluída.
- `npm run sam:test`: saúde 200, sessão ausente 401 e origem inválida 403,
  usando Lambda em Docker e DynamoDB local.
- `npm run build`: TypeScript e frontend compilados com sucesso.
- `npm run sam:test:integration`: 19 cenários aprovados, zero falhas após a
  correção da autorização de cadastro de veículo.
- `npm run build:lambda`: bundle CommonJS e ZIP gerados; conteúdo conferido.
- Preview e up da API dev concluídos; função ativa e logs de execução confirmados.
- `scripts/verify-dev-api.mjs`: quatro verificações HTTP reais aprovadas,
  sem criação de dados de negócio.
- Simulação IAM confirmou acesso ao banco dev e negação ao banco prod.

As verificações foram executadas durante a implementação; não constituem ainda
uma pipeline de CI. Não houve renderização visual automatizada dos diagramas.

## 7. Limites e próximos passos

- DNS e domínio continuam pendentes; nenhum recurso Route 53 foi provisionado.
- Lambda/API Gateway já foram publicados em dev; publicação da API em prod
  continua pendente e desabilitada no programa nesta etapa.
- O banco SAM fica vazio antes dos testes; a suíte agora prepara fixtures para
  os fluxos de negócio. Cobertura completa, concorrência e testes de interface
  permanecem pendentes.
- Login válido e gravações de negócio na nuvem ainda precisam de contas de
  desenvolvimento preparadas por procedimento controlado; fixtures locais
  não foram migradas para AWS.
- E-mail real, worker remoto, push, OBD2 real, testes abrangentes e CI/CD
  permanecem no backlog conforme o escopo acordado.
- Acesso e integração com a publicação Vercel continuam pendentes.
- SAM é usado localmente; a implantação de infraestrutura AWS é responsabilidade
  do Pulumi. Não aplicar este template local com `sam deploy`.

## Consultar a diferença após o commit

```powershell
git diff main...HEAD --stat
git diff main...HEAD
```

O commit não publica código na Vercel nem executa novos deploys AWS por si só.

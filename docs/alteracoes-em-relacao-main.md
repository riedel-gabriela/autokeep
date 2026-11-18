# Alterações em relação à main

Data: 18/11/2026.

Base da comparação: `main` no commit `ac69017438c754fbc9cd6337b4be52f421832e75`
(`feat: publish persistent autokeep app`). O documento descreve o conjunto de
alterações locais preparado para a branch `alterações-stacks`.

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
| `npm run sam:down` | Parar o banco local preservando o volume |

## 5. Arquivos ignorados e credenciais

- `.gitignore` inclui artefatos `.aws-sam/` e configuração local `samconfig.toml`.
- Exceções permitem versionar `infra/Pulumi.dev.yaml` e `infra/Pulumi.prod.yaml`.
- Não são incluídos `.env`, tokens, credenciais AWS/Pulumi, `node_modules`,
  arquivos de build ou volumes Docker.
- Os arquivos de stack contêm ID da conta e nome do perfil local, que não são
  chaves de acesso. Outros desenvolvedores precisam configurar seus próprios
  perfis e autenticar no backend de estado autorizado.

## 6. Verificações já realizadas

- Conferência estrutural de 22 operações OpenAPI por backend, referências e links locais.
- `npm run check --prefix infra`: TypeScript aprovado.
- `npm test --prefix infra`: quatro testes aprovados após o modo sem DNS.
- Script PowerShell validado sintaticamente e com execução simulada.
- Preview real e aplicação Pulumi concluídos para as duas stacks.
- DescribeTable confirmou estado, capacidade, chaves e proteção das tabelas.
- `npm run sam:validate`: template válido com lint.
- `npm run sam:build`: compilação concluída.
- `npm run sam:test`: saúde 200, sessão ausente 401 e origem inválida 403,
  usando Lambda em Docker e DynamoDB local.
- `npm run build`: TypeScript e frontend compilados com sucesso.

As verificações foram executadas durante a implementação; não constituem ainda
uma pipeline de CI. Não houve renderização visual automatizada dos diagramas.

## 7. Limites e próximos passos

- DNS e domínio continuam pendentes; nenhum recurso Route 53 foi provisionado.
- Lambda/API Gateway na AWS ainda não foram publicados nesta etapa.
- O banco SAM fica vazio por padrão: seed de contas e testes completos de negócio
  ainda precisam ser preparados.
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

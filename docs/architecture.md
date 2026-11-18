# Arquitetura do AutoKeep

Revisão da sprint 1 em 16/11/2026, baseada no código `ac69017`. Os diagramas representam código e configuração encontrados, sem comprovar execução em contas externas.

## Ambientes e responsabilidades

| Ambiente | Interface e entrada | Backend | Banco | Situação |
| --- | --- | --- | --- | --- |
| Local | Vite integrado ao Node, localhost:8080 | createApp em src/server/app.ts | MySQL 8.0 | Configurado no Compose |
| Publicação documentada | SPA dist/web na Vercel | api/index.ts e createCloudApp | DynamoDB | Documentado/configurado; deploy não verificado |
| AWS planejada | CDN, DNS e certificado | API Gateway e Lambda | DynamoDB por ambiente | Infraestrutura e integração pendentes |

As duas APIs compartilham regras em `src/shared/domain.ts`, mas diferem em persistência, auditoria e notificações. Os bancos não possuem sincronização automática.

## Blocos do ambiente local

```mermaid
flowchart LR
  U[Navegador] -->|HTTP localhost:8080| APP
  subgraph DOCKER[Docker Compose local]
    APP[Node: Vite e API Express createApp]
    RULES[Regras compartilhadas]
    DB[(MySQL 8.0)]
    WORKER[Avaliador de alertas]
    MAIL[Mailpit]
    APP --> RULES
    APP -->|Consultas e transações| DB
    APP -->|Convites SMTP| MAIL
    APP -.->|Inicialização| WORKER
    WORKER --> RULES
    WORKER --> DB
    WORKER -->|Avisos SMTP| MAIL
  end
  U -->|HTTP localhost:8025| MAIL
  DB --> VOL[Volume mysql-data]
```

`scripts/dev.mjs` inicia o Compose. O servidor aplica migrações, executa seed quando aplicável e inicia API, Vite e avaliador. O worker avalia ao iniciar e agenda a próxima execução 15 minutos após concluir a anterior. Aplicação e Mailpit são publicados no loopback; MySQL fica na rede interna do Compose. Esse ambiente não exige login AWS/Pulumi. O modo local não inicia com NODE_ENV=production.

## Blocos da publicação documentada

```mermaid
flowchart LR
  U[Navegador React] -->|HTTPS: arquivos da SPA| V[Vercel: dist/web]
  U -->|Mesmo domínio: /api e cookie| R[Reescrita vercel.json]
  R --> E[Vercel Function: api/index.ts]
  E --> API[Express createCloudApp]
  API --> RULES[src/shared/domain.ts]
  API --> D[dynamo.ts: assinatura SigV4]
  D -->|HTTPS| DB[(AWS DynamoDB: pk e sk)]
```

O README indica tabela `autokeep-dev` em `us-east-1`; a conta não foi consultada nesta revisão. Região, tabela e credenciais vêm de variáveis de ambiente; não publicar segredos no Git. Login usa bcrypt e sessão em cookie, não Cognito/JWT. Convites retornam link sem envio real de e-mail. As rotas de notificações retornam lista vazia e confirmação de leitura sem persistência; não há avaliador remoto ativo no código.

## Arquitetura AWS planejada

Todos os componentes abaixo são alvo de implementação/validação, não descrição de infraestrutura ativa.

```mermaid
flowchart TD
  U[Navegador] -.->|Consulta DNS| DNS[Route 53]
  U -->|HTTPS| CDN[CloudFront]
  CERT[ACM: certificado do domínio] -.-> CDN
  CDN -->|Arquivos estáticos| S3[S3 privado: SPA]
  CDN -->|API sem cache de sessão| GW[API Gateway]
  GW --> L[Lambda API: lambda/index.ts]
  L --> DB[(DynamoDB do ambiente)]
  L --> SES[SES: convites e e-mails]
  EVT[EventBridge] --> W[Worker Lambda para DynamoDB a implementar]
  W --> DB
  W --> SES
  L -.-> LOG[CloudWatch]
  W -.-> LOG
```

DNS resolve nomes; não é proxy HTTP. A opção desenhada mantém interface e API no mesmo domínio para preservar sessões atuais. Manter o frontend na Vercel em vez de S3 é uma decisão a confirmar para a entrega. Cognito/OIDC é uma possibilidade futura, não uma integração já implementada.

`lambda/index.ts` adapta eventos HTTP para createCloudApp e `scripts/build-lambda.mjs` prepara o pacote. Esses arquivos não criam recursos AWS. O worker MySQL não pode ser publicado como worker DynamoDB sem adaptação.

## Git, Pulumi e AWS

```mermaid
flowchart LR
  DEV[Código da aplicação e infraestrutura] --> GIT[Git e GitHub: histórico e colaboração]
  GIT -.->|Pipeline pendente| CI[Testes e build]
  CI -.-> P[Pulumi: preview e atualização por stack]
  P -.-> STATE[Backend de estado]
  P -.-> AWS[AWS: execução e armazenamento]
```

Um push só publica se existir automação configurada. Pulumi Cloud guarda o estado; não executa o backend da aplicação. O programa da sprint 2 está em `infra/`, com DynamoDB e Route 53 por stack; registro e aplicação reais dependem de autenticação e domínio autorizado. O exemplo de bucket em `pulumi-start-aws` é histórico. Lambda/CDN/certificados ainda são alvo das próximas sprints.

## Modelo de dados

### MySQL local

Migrações em `db/` definem usuários, organizações, associações, veículos, leituras, trocas, sessões, convites, auditoria e notificações. O backend utiliza transações nas operações compostas.

```mermaid
erDiagram
  USERS ||--o{ MEMBERSHIPS : participa
  ORGANIZATIONS ||--o{ MEMBERSHIPS : possui
  ORGANIZATIONS ||--o{ VEHICLES : possui
  USERS o|--o{ VEHICLES : dirige
  VEHICLES ||--o{ READINGS : registra
  VEHICLES ||--o{ OIL_CHANGES : recebe
  USERS ||--o{ SESSIONS : autentica
  ORGANIZATIONS ||--o{ INVITATIONS : convida
  ORGANIZATIONS ||--o{ AUDIT_LOGS : registra
  VEHICLES ||--o{ NOTIFICATIONS : gera
  USERS ||--o{ NOTIFICATIONS : recebe
```

Este resumo não substitui as restrições SQL: atribuição exige associação na mesma organização.

### DynamoDB da API de nuvem

Chaves atuais: `pk` e `sk`, em minúsculas. Os GSIs descritos na arquitetura antiga não são utilizados pelo adaptador atual.

| Partição pk | Sort key sk | Conteúdo |
| --- | --- | --- |
| USER#id | PROFILE, ORG#organizationId | Perfil e associações |
| EMAIL#email | USER | Localização de conta por e-mail |
| ORG#id | PROFILE, MEMBER#userId, CAR#vehicleId, AUDIT#... | Espaço e entidades |
| CAR#id | READING#..., OIL#... | Histórico |
| SESSION#hash | SESSION | Sessão, expiração e campo ttl |
| INVITE#hash | INVITE | Convite, validade e aceite |
| META | SEED | Controle da demonstração |

`dynamo.ts` usa GetItem, PutItem, DeleteItem e Query. Algumas criações têm condição, mas o adaptador não oferece transação multirregistro. Não presumir atomicidade equivalente ao MySQL. O campo ttl não comprova expiração automática configurada na tabela; o código verifica validade de sessões e convites.

## Segurança e limites

- Sessão de 12 horas, hash do token persistido e cookie HttpOnly/SameSite Strict. Secure depende da origem/configuração.
- Escritas exigem origem esperada e JSON. Associação, papel e visibilidade são verificados pela API.
- Respostas da API usam Cache-Control no-store; futuras configurações de CDN devem preservar dados privados.
- Auditoria e notificações não têm paridade completa entre backends. Mailpit é teste local; hardware OBD2, push e OAuth externo continuam pendentes.
- Regras de óleo, média e projeção estão em `src/shared/domain.ts`, descritas em [requisitos.md](requisitos.md).

## Documentos relacionados

- [Requisitos e regras](requisitos.md)
- [Casos de uso](casos-de-uso.md)
- [Fluxogramas](fluxogramas.md)
- [Contratos e diferenças dos ambientes](contratos-api.md)
- [Pendências das sprints](pendencias-sprints.md)

# AutoKeep

Cuide do seu carro e da sua frota. Aplicação responsiva em português, com React,
TypeScript, API Node.js e MySQL 8.0 no Docker local.

## Rodar localmente

Requisitos: Node.js 22.12 ou superior e Docker com Compose, em execução.
Docker Desktop ou Colima com `docker-compose` também são aceitos.

```sh
npm run dev
```

Abra **http://localhost:8080**. O comando cria o `.env` com senhas aleatórias,
constrói a imagem, inicia o MySQL, aplica as migrações e cria dados de exemplo
somente quando o banco está vazio. O primeiro início pode levar alguns minutos.
Não é necessário instalar as dependências no host para esse comando.

`npm run deve` é um alias de `npm run dev`.

Em outro terminal, consulte os acessos locais:

```sh
npm run credentials
```

| Perfil          | E-mail                  | Permissões                                 |
| --------------- | ----------------------- | ------------------------------------------ |
| Garagem pessoal | `ana@autokeep.local`    | Gerencie os próprios veículos e trocas     |
| Gestão de frota | `marina@autokeep.local` | Gerencie veículos, motoristas e manutenção |
| Motorista       | `lucas@autokeep.local`  | Consulte veículos atribuídos e atualize km |

A senha gerada é compartilhada pelos perfis de demonstração. O login usa
hash bcrypt e sessão opaca com expiração, persistida no banco. Esse provedor
local é bloqueado quando `NODE_ENV=production`.

Os e-mails de convites e alertas são capturados pelo **Mailpit** em
**http://localhost:8025**. Nenhuma mensagem é enviada para a internet.

## Uso

- **Meu carro:** consulte a próxima troca por tempo e quilometragem, registre
  leituras e trocas de óleo, acompanhe a média diária e o histórico.
- **Frota:** veja alertas e situação dos veículos, pesquise e filtre, convide
  motoristas e atribua ou desatribua veículos preservando todo o histórico.
- **Convites:** copie o link ou abra o e-mail no Mailpit. O destinatário pode
  criar sua conta pelo convite ou entrar com uma conta existente. Válido por
  sete dias; apenas o hash do token fica no banco.
- **Notificações:** consulte avisos de manutenção e calibração no aplicativo.
  O avaliador local é executado ao iniciar e a cada 15 minutos.
- **Espaços:** crie garagens e frotas adicionais e alterne pelo menu lateral.

## Parar e persistir

Use `Ctrl+C` no terminal do desenvolvimento para parar os serviços ou:

```sh
npm run down
```

Os dados ficam no volume `autokeep-local_mysql-data`. Parar/recriar os
containers preserva os dados. Preserve também o `.env`: trocar a senha nele
não altera automaticamente a senha de um banco que já foi inicializado.
Não use `down -v` se quiser manter os dados.

Somente a aplicação (`8080`) e a caixa de e-mails (`8025`) são publicadas no
loopback. O MySQL fica acessível apenas pela rede interna do Compose.
As pastas de código são montadas no container com atualização automática.
Depois de alterar dependências, execute `npm run dev` novamente para reconstruir.

## Compilar no host

### Testar a API Lambda com SAM

O [guia de SAM local](docs/sam-local.md) explica como compilar a API e executar
o caminho DynamoDB localmente, sem usar as tabelas AWS:

```powershell
npm ci
npm run sam:validate
npm run sam:build
npm run sam:db
npm run sam:local
```

Em outro terminal, consulte `http://127.0.0.1:3000/api/health`.
Esse ambiente é separado do MySQL e usa um banco de testes inicialmente vazio.
Com a API em execução, `npm run sam:test:integration` cria contas fictícias e
valida login, sessões, veículos e permissões. Consulte os
[cenários de teste](docs/testes-api-local.md); senhas/resultados locais ficam
fora do Git.

Para usar editor, TypeScript e compilação no host:

```sh
npm ci
npm run build
```

O build gera a SPA em `dist/web`. A API local usa MySQL; a função da Vercel
usa DynamoDB Standard na AWS.

## Estrutura

### Documentação da sprint 1

- [Requisitos, regras e situação por ambiente](docs/requisitos.md)
- [Arquitetura atual e planejada, com diagramas](docs/architecture.md)
- [Casos de uso e exceções](docs/casos-de-uso.md)
- [Fluxogramas dos processos](docs/fluxogramas.md)
- [Contrato HTTP atual](docs/openapi.yaml) e [diferenças entre backends](docs/contratos-api.md)
- [Tarefas das sprints](docs/pendencias-sprints.md)

O PDF de especificação e o [contrato Cognito anterior](docs/openapi.legacy.yaml)
são referências históricas. A documentação atual distingue funcionalidades
implementadas, limites e recursos AWS ainda planejados.

```text
src/web/        interface React responsiva
src/shared/     tipos e regras de manutenção independentes da interface
src/server/     API, autorização, MySQL, e-mails e avaliador de alertas
db/             migrações SQL versionadas
scripts/        inicialização Docker e consulta dos acessos locais
public/         identidade visual e manifest de instalação
docs/           requisitos originais e decisões de implementação
```

## Frontend na Vercel

O arquivo `vercel.json` define o preset Vite, a instalação das dependências de
build, o comando `npm run build` e a saída `dist/web`.

Nas configurações do projeto Vercel, use a raiz do repositório (`.`) como
**Root Directory**. Remova referências à estrutura antiga `apps/web`.
Essa configuração de raiz é feita no painel da Vercel; `vercel.json` não a altera.

O deploy publica a interface Vite e a API em uma Vercel Function. Ela acessa
uma única tabela DynamoDB, `autokeep-dev`, na região `us-east-1`. A tabela usa
`pk` e `sk` como chaves String, classe Standard, modo provisionado com 5 RCU e
5 WCU fixos, sem índices, backups contínuos, replicação ou KMS próprio.
Esses valores cabem na cota gratuita de 25 RCU, 25 WCU e 25 GB por conta;
tráfego acima da capacidade é limitado pelo DynamoDB. Armazenamento e outros
recursos AWS fora da cota podem gerar consumo de créditos. Consulte os limites
atuais na [página oficial de preços](https://aws.amazon.com/dynamodb/pricing/).

Crie uma identidade de aplicação sem acesso ao console e restrinja-a à tabela
com [esta política](infra/autokeep-dynamodb-policy.json). Configure as seguintes
variáveis secretas no projeto Vercel: `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `AWS_REGION=us-east-1`,
`DYNAMODB_TABLE=autokeep-dev`, `APP_ORIGIN=https://<domínio do projeto>`,
`SEED_DEMO=true` e `DEMO_PASSWORD` (senha aleatória com pelo menos 16 caracteres,
diferente do Docker). O primeiro acesso cria três perfis de demonstração:
`ana@autokeep.local`, `marina@autokeep.local` e `lucas@autokeep.local`, com um
veículo atribuído ao motorista. Use `/api/health` para verificar a conexão.
No checkout usado para publicar, consulte a senha com
`npm run credentials -- --cloud`. O arquivo `.env.cloud.local` é local e
ignorado pelo Git.

Os convites publicados devolvem um link para copiar; não enviam e-mail. A
avaliação periódica de notificações continua exclusiva do Docker local.

## AWS e Pulumi

O ambiente publicado usa uma tabela DynamoDB da cota gratuita. A estrutura
Pulumi de duas stacks isoladas, `dev` e `prod`, está definida em [`infra/`](infra/README.md).
As stacks `dev` e `prod` e suas tabelas foram provisionadas em 18/11/2026 na conta
AWS configurada localmente, com DNS desativado. Consulte as
[evidências e limites](docs/infraestrutura-provisionada.md). São bancos novos;
a publicação Vercel não foi reconfigurada e seus dados não foram migrados.

Para verificar a infraestrutura sem acessar AWS ou Pulumi:

```powershell
npm ci --prefix infra
npm run check --prefix infra
npm test --prefix infra
```

O guia em `infra/README.md` explica perfis AWS, registro das stacks, domínio/DNS,
referência/importação de recursos existentes e `preview`. O script
`scripts/configure-infra.ps1` configura uma stack após autenticação, sem aplicar
recursos. `pulumi-start-aws/` permanece apenas como exemplo histórico.

O pacote da API para AWS Lambda é gerado com `npm run build:lambda` em
`dist/autokeep-lambda.zip`, com handler `index.handler` para Node.js 24.x.
A [API dev foi publicada pelo Pulumi](docs/api-dev-publicada.md), com endpoint
HTTP e role limitada à tabela autokeep-dev. O site da Vercel não foi reconfigurado
e continua com sua integração anterior. Produção permanece sem essa Lambda.

Consulte [as decisões e a cobertura dos requisitos](docs/implementation.md).

Sem commits ou pushes automáticos.

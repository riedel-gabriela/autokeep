# AutoKeep

Aplicação em português para organizar manutenção de carros e frotas. O frontend
usa React/TypeScript, a API usa Express e os dados ficam em DynamoDB. Inclui
garagem pessoal, gestão de frota, histórico de manutenção, lembretes, login
local, OAuth Google opcional, Web Push e temas claro/escuro.

## Estado publicado

- Aplicação: <https://autokeep.negoci.online>
- AWS em `us-east-1`: CloudFront serve os arquivos do S3 privado; `/api/*` segue
  por API Gateway HTTP para a Lambda `autokeep-api-prod` e a tabela
  `autokeep-prod`.
- A zona Route 53 existente atende `autokeep.negoci.online`; o Pulumi gerencia a
  hospedagem e seus registros. A tabela e a Lambda existentes são adotadas,
  não duplicadas.

## Desenvolvimento local ou no Codespace

Requisitos: Node.js 22.12+ e Docker com Compose em execução. O fluxo local usa
DynamoDB Local e Mailpit, sem credenciais AWS ou Pulumi.

```sh
npm ci
npm run dev            # aplicação, DynamoDB Local e Mailpit
npm run credentials    # perfis e senha de demonstração local
npm run down            # para containers; preserva os dados locais
```

Abra `http://localhost:8080` e `http://localhost:8025` (Mailpit). No Codespace,
use as portas 8080 e 8025 da aba **Ports** e mantenha-as privadas. O primeiro
`npm run dev` cria `.env` com uma senha aleatória. Não compartilhe a senha.

Os dados persistem no volume Docker `autokeep-local_dynamodb-data`. Para apagar
também o banco local e começar de novo, execute `docker compose down --volumes`
na raiz. Isso apaga somente o volume Docker local.

### Web Push local opcional

Gere chaves VAPID com `npx web-push generate-vapid-keys --json` e configure
`PUSH_PUBLIC_KEY`, `PUSH_PRIVATE_KEY` e `PUSH_SUBJECT` no `.env`. Consulte
[`docs/sam-local.md`](docs/sam-local.md) para execução da Lambda local via SAM.

## Verificação e builds

```sh
npm test                  # testes unitários
npm run test:integration  # API com DynamoDB Local descartável
npm run build             # valida TypeScript e gera dist/web
npm run build:lambda      # gera dist/autokeep-lambda.zip
```

O teste de integração precisa de Docker. Builds não publicam a aplicação. O
workflow [CI](.github/workflows/ci.yml) executa testes e builds em pushes e pull
requests. Para validar a resposta básica publicada:

```sh
curl -i https://autokeep.negoci.online/api/health
```

Saúde da API não substitui testes de login, gravação e isolamento entre contas.

## Pulumi e AWS

Faça operações de infraestrutura no Codespace que possui os secrets AWS e o
acesso ao backend Pulumi. Não imprima nem comite esses secrets. O deploy de
produção usa `pulumi-start-aws/Pulumi.prod.yaml`; o fluxo completo, incluindo
`preview`, `up` e `destroy`, está em
[`pulumi-start-aws/README.md`](pulumi-start-aws/README.md).

Resumo a partir da raiz:

```sh
npm ci
npm run build
npm run build:lambda
cd pulumi-start-aws
npm ci
npm run check
pulumi login
pulumi stack select prod
pulumi preview --diff
pulumi up
pulumi stack output
```

Leia o preview antes de confirmar `pulumi up`. Não adicione recursos pagos sem
estimar o custo e obter aprovação. Créditos e franquias gratuitas não são teto
de consumo.

## Autenticação nos ambientes

No Docker local, os três perfis usam a mesma senha de demonstração: a API a
preenche automaticamente no login depois de carregar os dados semeados no
DynamoDB Local. O terminal também mostra a senha com `npm run credentials`.
Na stack AWS `dev`, o login é por e-mail e senha. Use
`npm run credentials:cloud` para consultar a senha configurada no arquivo local
`.env.cloud.local`.

Na produção, a API aceita login por Google OAuth. O login por senha e o cadastro
de convite por senha ficam bloqueados; a tela permite vincular uma conta
existente uma vez antes de seguir com o Google. Um usuário novo pode criar seu
espaço com Google. O Pulumi exige o client ID e o ARN do segredo OAuth antes de
aprovar o preview de produção.

## Features e configuração AWS

OAuth Google exige um cliente OAuth, segredo no Secrets Manager e configuração
da stack Pulumi. Web Push agendado exige chaves VAPID e habilitação explícita na
stack `dev`. Esses recursos estão desligados sem configuração e não são ativados
por este deploy. Consulte o guia Pulumi e verifique custos antes de habilitá-los.

As notificações no app são persistidas e deduplicadas. E-mail real não está
configurado; convites cloud oferecem link copiável. OBD2 aceita somente valor
confirmado pelo usuário; leitura automática por Bluetooth e operação offline
não estão implementadas.

## Estrutura

```text
src/web/           frontend React
src/shared/        contratos e regras de manutenção
src/server/        API, autenticação e persistência DynamoDB
lambda/            adaptador AWS Lambda
pulumi-start-aws/  stacks e recursos AWS
scripts/           desenvolvimento, builds e integração local
tests/             testes unitários e de integração
docs/              arquitetura, auditorias e guias
```

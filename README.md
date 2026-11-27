# AutoKeep

Garagem pessoal para acompanhar quilometragem, trocas de óleo, vencimentos e
histórico de manutenção. Frontend React/TypeScript, API Express e DynamoDB.
A produção usa Google OAuth e está em <https://autokeep.negoci.online>.

## Rodar em desenvolvimento

Requisitos: Node.js 22.12+ e Docker com Compose em execução.

```sh
npm ci
npm run dev
```

Abra <http://localhost:8080> e clique em **Entrar**. O ambiente usa uma conta
pessoal de teste e DynamoDB Local, sem credenciais AWS. No Codespace, abra a
porta **8080** na aba **Ports** e mantenha-a privada. Não há formulário de senha.

Para parar os containers, preservando o banco local:

```sh
npm run down
```

## Testar e gerar os artefatos

```sh
npm test
npm run test:integration
npm run build
npm run build:lambda
```

A integração requer Docker e usa um banco descartável. Os builds geram
`dist/web` e `dist/autokeep-lambda.zip`; não publicam a aplicação.
O [workflow CI](.github/workflows/ci.yml) executa testes e builds em pushes e PRs.

## Publicar na AWS com Pulumi

Use o Codespace com as credenciais AWS e acesso ao backend Pulumi. A partir da
raiz, gere os builds antes de entrar na pasta de infraestrutura:

```sh
npm ci
npm run build
npm run build:lambda
cd pulumi-start-aws
npm ci
npm run check
pulumi login
pulumi preview --diff --stack dev
pulumi up --stack dev
pulumi stack output --stack dev
```

Depois de testar a URL de desenvolvimento, publique os mesmos artefatos em
produção:

```sh
pulumi preview --diff --stack prod
pulumi up --stack prod
pulumi stack output --stack prod
```

O [guia Pulumi](pulumi-start-aws/README.md) explica configuração, custos e
proteções. `pulumi destroy` não é um comando para pausar a aplicação: recursos
com dados têm proteção e/ou retenção. Não remova essas proteções sem revisar
os dados e o estado. A configuração adota tabelas e Lambdas existentes; não
promete recriar do zero recursos externos ou seus dados.

## Autenticação e dados

- **Docker/Codespaces e AWS dev:** botão **Entrar**, habilitado no servidor
  somente com `NODE_ENV=development` e `DEV_LOGIN_ENABLED=true`.
- **Produção:** somente **Entrar com Google**. O primeiro acesso cria a garagem
  pessoal; acessos seguintes preservam veículos e histórico. O acesso de
  desenvolvimento é bloqueado pela API de produção.
- Cada conta acessa somente sua garagem pessoal. As estruturas legadas de
  organização são mantidas internamente para preservar dados existentes;
  gestão de frota, convites e perfis de gestor/motorista foram removidos.

## Funcionalidades e limites

Cadastro, consulta e arquivamento de veículos; leituras de quilometragem;
trocas de óleo; previsão pela média das leituras; vencimento por tempo ou
quilometragem; notificações persistidas; histórico, auditoria e tema claro/escuro.

Web Push depende de configuração e permissão do navegador. E-mail de produção
não está implementado. OBD2 aceita valor confirmado pelo usuário, sem conexão
automática ao adaptador. GPS e operação offline também não estão implementados.
As pendências acadêmicas estão em [milestones](docs/milestone-audit.md).

## Guias

- [Codespaces](docs/codespaces.md)
- [Arquitetura](docs/architecture.md)
- [Implementação](docs/implementation.md)
- [Contrato REST](docs/openapi.local.yaml)
- [Lambda e API com SAM local](docs/sam-local.md)
- [Estudo de quilometragem por GPS](docs/gps-study.md)

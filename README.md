# AutoKeep

Aplicação web serverless para monitoramento de odômetro e manutenção de
veículos pessoais ou frotas. O frontend é desenvolvido em React, a API roda em
AWS Lambda e toda a infraestrutura é provisionada com Pulumi.

Os requisitos, diagramas e decisões técnicas estão em [`docs/`](docs/).

## Pré-requisitos

- Node.js 20 ou superior;
- npm;
- AWS CLI v2;
- Pulumi CLI;
- uma conta AWS e um backend de estado Pulumi.

Confira as instalações:

```bash
node --version
npm --version
aws --version
pulumi version
```

## Instalação

```bash
git clone https://github.com/riedel-gabriela/autokeep.git
cd autokeep
npm install
```

Valide o projeto:

```bash
npm run check
npm run test
npm run build
```

## Executar localmente

O frontend roda em `http://localhost:5173`. A autenticação, a API e o banco de
dados usam uma stack AWS de desenvolvimento, portanto ela precisa existir antes
de iniciar a interface.

### 1. Autentique a AWS e o Pulumi

Exemplo com um perfil AWS SSO:

```bash
aws configure sso --profile autokeep-dev
aws sso login --profile autokeep-dev
export AWS_PROFILE=autokeep-dev
aws sts get-caller-identity
pulumi login
```

Se você não usa SSO, configure um perfil AWS pelo método adotado na sua conta.

### 2. Configure a stack de desenvolvimento

Na primeira execução:

```bash
pulumi -C infra stack init dev
pulumi -C infra config set aws:region us-east-1
pulumi -C infra config set senderEmail voce@example.com
```

Se a stack já existe:

```bash
pulumi -C infra stack select dev
```

### 3. Provisione a infraestrutura

```bash
./scripts/deploy.sh dev
```

O script instala as dependências, executa testes e build e aplica o programa
Pulumi na AWS.

Após o deploy, confirme o endereço configurado em `senderEmail` pela mensagem
enviada pelo Amazon SES.

### 4. Configure o frontend local

```bash
cp docs/config.example.json docs/config.json
cp apps/web/.env.example apps/web/.env.local
```

Consulte os valores da stack:

```bash
pulumi -C infra config get aws:region
pulumi -C infra stack output apiEndpoint
pulumi -C infra stack output userPoolId
pulumi -C infra stack output userPoolClientId
```

Preencha `docs/config.json` com os valores da stack:

```json
{
  "apiBaseUrl": "",
  "authority": "https://cognito-idp.<REGIAO>.amazonaws.com/<USER_POOL_ID>",
  "clientId": "<USER_POOL_CLIENT_ID>",
  "redirectUri": "http://localhost:5173",
  "logoutUri": "http://localhost:5173"
}
```

Em `apps/web/.env.local`, defina o endpoint retornado pelo Pulumi:

```dotenv
AUTOKEEP_API_PROXY_TARGET=https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com
```

### 5. Inicie o frontend

```bash
npm run dev:web
```

Acesse [http://localhost:5173](http://localhost:5173).

## Comandos principais

| Comando | Descrição |
| --- | --- |
| `npm run dev:web` | Inicia o frontend local |
| `npm run check` | Verifica os tipos |
| `npm run test` | Executa os testes |
| `npm run build` | Compila todos os workspaces |
| `./scripts/deploy.sh dev` | Atualiza a stack de desenvolvimento |
| `pulumi -C infra preview` | Exibe mudanças de infraestrutura |

## Produção

Use uma stack independente:

```bash
pulumi -C infra stack init prod
pulumi -C infra config set aws:region us-east-1
pulumi -C infra config set senderEmail notificacoes@seu-dominio.com
./scripts/deploy.sh prod
```

O GitHub Actions sempre valida tipos, testes e build. O deploy automático só é
habilitado quando `DEPLOY_PRODUCTION=true`, `AWS_REGION`,
`AWS_DEPLOY_ROLE_ARN` e `PULUMI_ACCESS_TOKEN` estiverem configurados no
repositório.

## Segurança

- não versione `.env.local`, `docs/config.json`, chaves ou tokens;
- armazene segredos de provedores com `pulumi config set --secret`;
- use perfis AWS com credenciais temporárias e menor privilégio.

## Documentação

- [Especificação técnica](docs/technical-specification.pdf)
- [Arquitetura](docs/architecture.md)
- [Contrato OpenAPI](docs/openapi.yaml)
- [Exemplo de configuração local](docs/config.example.json)
- [Changelog](CHANGELOG.md)

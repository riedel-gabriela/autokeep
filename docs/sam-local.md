# API AutoKeep com AWS SAM local

O template `template.yaml` reutiliza `lambda/index.ts` e `createCloudApp()`,
testando o caminho DynamoDB da API. O ambiente MySQL de `npm run dev` continua
separado. SAM é usado para desenvolvimento local; Pulumi gerencia a nuvem.

## Pré-requisitos

- Node.js >=22.12, npm e dependências instaladas com `npm ci`.
- AWS SAM CLI (`sam --version`), Docker Desktop iniciado em modo Linux e AWS CLI.
- Portas locais 3000 (API) e 8000 (DynamoDB) disponíveis.

Não é necessário autenticar AWS ou Pulumi para este fluxo. Os scripts usam
credenciais fictícias em subprocessos, sem alterar os perfis reais do computador.

## Executar

Na raiz do projeto, em um novo PowerShell:

```powershell
npm ci
npm run sam:validate
npm run sam:build
npm run sam:db
npm run sam:local
```

- `sam:validate`: valida o template com o linter do SAM.
- `sam:build`: esbuild compila TypeScript e produz `.aws-sam/build/AutoKeepApi/index.cjs`.
- `sam:db`: sobe somente o Compose de testes e inicializa a tabela `autokeep-local`,
  com chaves String `pk`/`sk`. Preserva tabela compatível já existente.
- `sam:local`: expõe a API em `http://127.0.0.1:3000`; precisa do build anterior.

O primeiro uso baixa a imagem DynamoDB e, na primeira chamada à função, a imagem
de execução Lambda Node.js 24. Isso pode demorar mais que as próximas execuções.

## Verificar saúde

Em outro terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

Resposta esperada:

```json
{ "status": "ok" }
```

Para verificar também sessão ausente (401) e origem inválida de escrita (403):

```powershell
npm run sam:test
```

O teste faz requisições ao localhost e não cria contas ou dados de negócio.

O evento equivalente está em `sam/events/health.json`. A API usa evento HTTP
payload 2.0; o adaptador encaminha método, caminho, corpo e cookies ao Express.

Escritas exigem `Origin: http://localhost:3000` e conteúdo JSON, conforme a API.
Consultar `/api/session` sem login deve retornar 401, não uma sessão válida.

## Banco e credenciais de teste

- Compose independente: `compose.sam.yaml`, projeto Docker `autokeep-sam`.
- DynamoDB do host: `http://127.0.0.1:8000`.
- Dentro da função: `http://host.docker.internal:8000` (Docker Desktop).
- Tabela fixa: `autokeep-local`, diferente de `autokeep-dev` e `autokeep-prod`.
- Volume persistente: `autokeep-sam_dynamodb-data`.
- `scripts/sam-db.mjs` usa endpoint local fixo e credenciais fictícias para criar
  a tabela. Falhas de consulta não são tratadas como tabela ausente indiscriminadamente.
- `scripts/sam-local.mjs` envia credenciais fictícias ao SAM e remove referências
  a perfis/tokens reais somente do ambiente do subprocesso.

O template mantém `SEED_DEMO=false`: banco vazio não possui contas para login.
Neste primeiro passo, valide saúde e acesso não autenticado. Dados de exemplo,
cadastro e testes de negócio locais são a próxima etapa; não use senhas da Vercel
esperando que existam nesse banco independente.

Não altere DYNAMODB_ENDPOINT para apontar à nuvem nesse fluxo de testes. Não execute
`sam deploy` ou `sam sync`: este template tem endpoint local e não é a definição
da implantação AWS. A Lambda publicada será configurada no programa Pulumi.

## Parar e manter os dados

Use Ctrl+C no terminal da API e depois:

```powershell
npm run sam:down
```

O comando para o banco e mantém o volume. Não remova o volume se quiser manter
os dados de teste. O ambiente Docker MySQL original não é parado por esse comando.

Após mudanças na API, repita `sam:build` e reinicie `sam:local`.

## Resolver problemas

- `sam` não encontrado: reabra o terminal depois da instalação.
- Docker indisponível: inicie o Docker Desktop e confira `docker info`.
- Porta ocupada: pare o processo correspondente ou ajuste as configurações locais
  em conjunto; mudar apenas a porta da API deixa APP_ORIGIN inconsistente.
- `esbuild` não encontrado: execute `npm ci` e use `npm run sam:build`, que inclui
  `node_modules/.bin` no PATH.
- Falha de conexão com banco: execute `npm run sam:db` e confira o Docker.
- Health com 503: consulte os logs do terminal SAM; confirme endpoint, tabela e
  que a execução foi iniciada pelo script de credenciais fictícias.

## Verificação realizada em 18/11/2026

- SAM CLI 1.173.0 validou o template com lint e compilou `index.cjs`.
- Tabela autokeep-local criada no DynamoDB Docker.
- `npm run sam:test` confirmou saúde 200, sessão ausente 401 e origem inválida 403,
  passando pela execução Lambda Node.js 24 no Docker.
- `npm run build` também concluiu a verificação TypeScript e o build do frontend.
- Nenhum recurso AWS ou configuração Vercel foi alterado por esta etapa.

## Referências oficiais

- [SAM e esbuild](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-using-build-typescript.html)
- [DynamoDB local](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.DownloadingAndRunning.html)

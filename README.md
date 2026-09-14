# AutoKeep

Aplicação web serverless para acompanhar o odômetro, prever trocas de óleo e
gerenciar veículos pessoais ou frotas. O projeto implementa os requisitos de
[`docs/technical-specification.pdf`](docs/technical-specification.pdf) em
TypeScript e provisiona toda a infraestrutura na AWS com Pulumi.

## O que o projeto entrega

- painel responsivo para administrador e motorista;
- cadastro de garagens, veículos, motoristas e trocas de óleo;
- cálculo do “duplo relógio” por distância e por tempo;
- calibração da média diária com até três leituras de odômetro;
- autenticação por e-mail no Amazon Cognito;
- login opcional com Google e Apple;
- alertas por e-mail com SES e eventos de notificação em SNS;
- leitura opcional de adaptadores OBD2 BLE pelo navegador;
- ambientes independentes por stack Pulumi, como `dev` e `prod`.

## Arquitetura

- **Frontend:** React + Vite, armazenado em um bucket S3 privado e servido pelo
  CloudFront.
- **API:** API Gateway HTTP API com funções AWS Lambda em Node.js 20.
- **Autenticação:** Amazon Cognito com Authorization Code + PKCE.
- **Banco de dados:** DynamoDB single-table, com criptografia habilitada.
- **Alertas:** Amazon SES para e-mail e Amazon SNS para eventos de push.
- **Agendamento:** Amazon EventBridge executa diariamente a avaliação de
  manutenção.
- **Infraestrutura como código:** Pulumi com TypeScript.

No ambiente publicado, o CloudFront encaminha `/api/*` para o API Gateway. No
desenvolvimento, o Vite faz o mesmo encaminhamento por proxy. Nos dois casos,
browser e API usam a mesma origem e a aplicação não precisa liberar CORS.

## Como funciona a execução local

O frontend roda localmente em `http://localhost:5173`, mas autenticação, API,
banco e envio de e-mails rodam em uma stack AWS de desenvolvimento. Portanto,
para usar a aplicação completa pela primeira vez, é necessário provisionar a
stack `dev` antes de iniciar o Vite.

Os testes das regras de domínio e dos handlers não dependem de uma stack AWS e
podem ser executados somente com Node.js.

## Pré-requisitos

Instale as seguintes ferramentas:

- [Git](https://git-scm.com/downloads);
- [Node.js](https://nodejs.org/en/download) 20 ou superior, com npm;
- [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html);
- [Pulumi CLI](https://www.pulumi.com/docs/install/);
- uma conta AWS com acesso aos serviços usados pelo projeto;
- uma conta gratuita do Pulumi Cloud, ou outro backend de estado configurado.

No Windows, use PowerShell ou WSL. O script `scripts/deploy.sh` requer um
ambiente compatível com Bash.

Confirme as instalações:

```bash
git --version
node --version
npm --version
aws --version
pulumi version
```

## Instalação e primeira execução

### 1. Clone o repositório

```bash
git clone https://github.com/riedel-gabriela/autokeep.git
cd autokeep
```

Se o repositório já estiver aberto no Codex ou em outra IDE, apenas entre na
pasta raiz antes de executar os comandos seguintes.

### 2. Instale as dependências

```bash
npm install
```

O projeto usa npm workspaces; um único `npm install` na raiz instala as
dependências do frontend, domínio, API e infraestrutura.

Se sua máquina estiver configurada para um registry corporativo indisponível e
você estiver autorizado a usar o registry público, execute:

```bash
npm install --registry=https://registry.npmjs.org
```

Não versione `node_modules`. O arquivo `package-lock.json` gerado pelo npm deve
ser mantido no projeto para tornar instalações futuras reproduzíveis.

### 3. Valide o código localmente

```bash
npm run check
npm run test
npm run build
```

Esses comandos executam, respectivamente:

1. verificação de tipos de todos os workspaces;
2. testes do domínio e da API;
3. build do domínio, API, frontend e programa Pulumi.

### 4. Autentique a AWS CLI

Use uma identidade IAM dedicada e com os menores privilégios possíveis. Nunca
use chaves do usuário raiz da conta AWS.

Se sua conta usa IAM Identity Center, crie um perfil SSO:

```bash
aws configure sso --profile autokeep-dev
aws sso login --profile autokeep-dev
export AWS_PROFILE=autokeep-dev
```

Caso sua conta pessoal ainda não use SSO, configure um perfil nomeado conforme
o método de credenciais adotado pela conta:

```bash
aws configure --profile autokeep-dev
export AWS_PROFILE=autokeep-dev
```

Valide a identidade que será usada pelo Pulumi:

```bash
aws sts get-caller-identity
```

Ela precisa conseguir criar e administrar recursos de DynamoDB, S3,
CloudFront, Cognito, API Gateway, Lambda, IAM, CloudWatch Logs, EventBridge,
SNS e SES. Não grave `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` ou tokens em
arquivos do repositório.

### 5. Autentique o Pulumi

Para usar o Pulumi Cloud como backend de estado:

```bash
pulumi login
```

O navegador abrirá para autenticação. O Pulumi Cloud é o backend padrão; quem
preferir estado autogerenciado deve configurar um
[backend compatível](https://www.pulumi.com/docs/iac/concepts/state-and-backends/)
antes de criar a stack.

### 6. Crie a stack de desenvolvimento

Na primeira execução, crie a stack:

```bash
pulumi -C infra stack init dev
```

Se ela já existir, apenas selecione-a:

```bash
pulumi -C infra stack select dev
```

Configure a região e um endereço de e-mail que você controla:

```bash
pulumi -C infra config set aws:region us-east-1
pulumi -C infra config set senderEmail voce@example.com
```

O `senderEmail` será cadastrado como identidade no SES. A região pode ser
alterada, mas deve ser a mesma em que você verificará o remetente e, durante os
testes no sandbox do SES, os destinatários.

Revise a configuração sem exibir segredos:

```bash
pulumi -C infra config
```

### 7. Provisione a stack AWS

Execute o script de implantação:

```bash
./scripts/deploy.sh dev
```

O script:

1. valida o nome da stack;
2. instala as dependências;
3. executa os testes;
4. compila todos os workspaces;
5. seleciona ou cria a stack;
6. executa `pulumi up`.

Confira o plano apresentado pelo Pulumi e confirme a criação dos recursos. A
primeira implantação pode demorar alguns minutos, principalmente por causa da
distribuição CloudFront.

Se o sistema informar que o script não é executável, rode:

```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh dev
```

Ao terminar, consulte os principais valores da stack:

```bash
pulumi -C infra stack output applicationUrl
pulumi -C infra stack output apiEndpoint
pulumi -C infra stack output userPoolId
pulumi -C infra stack output userPoolClientId
pulumi -C infra stack output hostedUiDomain
```

### 8. Confirme o remetente no Amazon SES

Abra a mensagem de verificação enviada pela AWS para o endereço configurado em
`senderEmail` e confirme a identidade. A verificação é específica da região.

Enquanto a conta estiver no sandbox do SES, os destinatários de teste também
precisam estar verificados. Veja a documentação sobre
[identidades e sandbox do SES](https://docs.aws.amazon.com/ses/latest/dg/send-email-concepts-deliverability.html).

### 9. Configure o frontend local

Crie os dois arquivos locais ignorados pelo Git:

```bash
cp docs/config.example.json docs/config.json
cp apps/web/.env.example apps/web/.env.local
```

Obtenha os valores necessários:

```bash
pulumi -C infra config get aws:region
pulumi -C infra stack output apiEndpoint
pulumi -C infra stack output userPoolId
pulumi -C infra stack output userPoolClientId
```

Edite `docs/config.json` com os valores da stack:

```json
{
  "apiBaseUrl": "",
  "authority": "https://cognito-idp.<REGIAO>.amazonaws.com/<USER_POOL_ID>",
  "clientId": "<USER_POOL_CLIENT_ID>",
  "redirectUri": "http://localhost:5173",
  "logoutUri": "http://localhost:5173"
}
```

Substitua `<REGIAO>`, `<USER_POOL_ID>` e `<USER_POOL_CLIENT_ID>`. Mantenha
`apiBaseUrl` vazio: as chamadas para `/api` passarão pelo proxy do Vite.

Depois, edite `apps/web/.env.local` e informe exatamente o `apiEndpoint`, sem
adicionar `/api` ao final:

```dotenv
AUTOKEEP_API_PROXY_TARGET=https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com
```

`docs/config.json` contém somente identificadores públicos do cliente OIDC. Não
coloque client secrets, credenciais AWS ou tokens nesse arquivo.

### 10. Inicie a aplicação

```bash
npm run dev:web
```

Acesse [http://localhost:5173](http://localhost:5173). Use essa porta porque ela
já está cadastrada como callback e logout permitidos no cliente Cognito criado
pelo Pulumi.

No primeiro acesso:

1. clique em **Entrar com segurança**;
2. crie ou acesse uma conta no Cognito;
3. confirme o e-mail se o Cognito solicitar;
4. crie a primeira garagem;
5. adicione um veículo e seus dados de manutenção.

Para encerrar o servidor local, pressione `Ctrl+C` no terminal.

## Verificações rápidas

### API pública de saúde

Copie o valor de `apiEndpoint` e teste:

```bash
curl https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/api/health
```

Resposta esperada:

```json
{"status":"ok"}
```

As demais rotas exigem um JWT válido emitido pelo Cognito.

### Aplicação hospedada

O frontend também é publicado durante o `pulumi up`. Abra o endereço retornado
por:

```bash
pulumi -C infra stack output applicationUrl
```

Esse endereço já recebe seu próprio `config.json`; os arquivos locais criados
na etapa 9 são necessários somente para o Vite.

## Login opcional com Google ou Apple

O login por e-mail do Cognito funciona sem provedores externos. Configure Google
ou Apple somente depois da primeira implantação, quando `hostedUiDomain` já
estiver disponível.

### 1. Cadastre o callback no provedor

Consulte o domínio:

```bash
pulumi -C infra stack output hostedUiDomain
```

No console do Google ou da Apple, cadastre o valor retornado seguido de:

```text
/oauth2/idpresponse
```

Exemplo:

```text
https://autokeep-dev-123456789012.auth.us-east-1.amazoncognito.com/oauth2/idpresponse
```

Esse é o endpoint de retorno exigido pelo
[Amazon Cognito para provedores sociais](https://docs.aws.amazon.com/cognito/latest/developerguide/federation-endpoints.html).

### 2. Configure o Google

```bash
pulumi -C infra config set googleClientId SEU_CLIENT_ID
pulumi -C infra config set --secret googleClientSecret
```

O segundo comando pede o segredo interativamente e o armazena criptografado no
estado do Pulumi.

### 3. Configure a Apple

```bash
pulumi -C infra config set appleClientId SEU_SERVICE_ID
pulumi -C infra config set appleTeamId SEU_TEAM_ID
pulumi -C infra config set appleKeyId SEU_KEY_ID
pulumi -C infra config set --secret applePrivateKey < /caminho/AuthKey.p8
```

Nunca copie a chave `.p8` para o repositório.

### 4. Aplique a alteração

```bash
./scripts/deploy.sh dev
```

## Comandos do dia a dia

| Comando | Finalidade |
| --- | --- |
| `npm run dev:web` | Inicia o frontend local na porta 5173 |
| `npm run check` | Verifica os tipos de todos os workspaces |
| `npm run test` | Executa os testes de domínio e API |
| `npm run build` | Compila aplicação e infraestrutura |
| `./scripts/deploy.sh dev` | Valida, compila e atualiza a stack `dev` |
| `pulumi -C infra preview` | Mostra mudanças de infraestrutura sem aplicá-las |
| `pulumi -C infra stack output` | Lista as saídas da stack atual |
| `pulumi -C infra logs` | Consulta logs relacionados à stack |

Depois de alterar o código, execute `npm run check`, `npm run test` e
`npm run build`. Para atualizar a AWS, execute novamente
`./scripts/deploy.sh dev`.

## Ambiente de produção

Use uma stack separada para não misturar dados e recursos de desenvolvimento:

```bash
pulumi -C infra stack init prod
pulumi -C infra config set aws:region us-east-1
pulumi -C infra config set senderEmail notificacoes@seu-dominio.com
./scripts/deploy.sh prod
```

Configure os provedores sociais na stack `prod` novamente; a configuração de
uma stack não é compartilhada com outra.

Quando o nome da stack é `prod`, o projeto habilita proteção contra exclusão no
DynamoDB e Cognito, recuperação point-in-time no DynamoDB e retenção maior de
logs. Trate a remoção dessa stack como uma operação excepcional e planejada.

## OBD2

A leitura OBD2 acontece inteiramente no navegador e usa Web Bluetooth. Para
testar:

1. use um navegador e sistema operacional com suporte à
   [Web Bluetooth API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API);
2. abra a aplicação em HTTPS ou em `http://localhost:5173`;
3. ligue um adaptador ELM327 compatível com Bluetooth Low Energy;
4. escolha o modo OBD2 no veículo e clique em **Conectar OBD2**;
5. confirme manualmente o odômetro antes de salvá-lo.

O PID padrão `01 31` informa a distância desde a limpeza dos códigos de falha,
não o odômetro total. Por isso, essa leitura é apenas uma referência e nunca
substitui automaticamente o valor exibido no painel do veículo.

## Notificações

- **E-mail:** funciona via SES após a verificação das identidades exigidas pela
  conta e pela região.
- **SNS:** a stack publica eventos no tópico informado por
  `notificationTopicArn`.
- **Web push remoto:** o service worker está preparado para receber eventos,
  mas a entrega a navegadores ainda exige a integração de um provedor de push e
  o cadastro das assinaturas dos usuários.

## Solução de problemas

### `npm install` não encontra o registry

Confira o registry atual:

```bash
npm config get registry
```

Se ele apontar para um servidor corporativo inacessível, use o registry público
somente se isso estiver de acordo com as políticas do seu ambiente:

```bash
npm install --registry=https://registry.npmjs.org
```

### `pulumi` ou `aws` não foi encontrado

Feche e abra o terminal depois da instalação e execute `pulumi version` e
`aws --version`. Se ainda falhar, revise o `PATH` conforme os guias oficiais de
instalação.

### Pulumi informa que não há credenciais AWS

Renove a sessão e confirme o perfil:

```bash
aws sso login --profile autokeep-dev
export AWS_PROFILE=autokeep-dev
aws sts get-caller-identity
```

Se você não usa SSO, renove as credenciais temporárias pelo método adotado na
sua conta.

### A página mostra “Configuração da aplicação indisponível”

Confirme que `docs/config.json` existe e contém JSON válido. O Vite publica a
pasta `docs` como arquivos estáticos durante o desenvolvimento.

### Login entra em loop ou retorna erro de callback

- mantenha o Vite na porta `5173`;
- use `http://localhost:5173`, sem trocar `localhost` por um IP;
- confirme se `authority` e `clientId` pertencem à mesma stack usada pela API;
- confira se não há barra adicional no final de `redirectUri` e `logoutUri`.

### A API retorna `401` ou `403`

- `401`: faça login novamente e confira `authority` e `clientId`;
- `403`: confirme se o usuário pertence à garagem e possui o papel necessário;
- não tente desabilitar o authorizer localmente: todas as rotas privadas exigem
  autenticação também em desenvolvimento.

### O e-mail não chega

- confirme a identidade remetente na mesma região da stack;
- verifique também o destinatário enquanto a conta estiver no sandbox do SES;
- confira spam e o status da identidade no console do SES;
- consulte os logs da função Lambda sem registrar endereços, tokens ou corpo da
  requisição.

### O navegador não encontra o adaptador OBD2

- verifique se o dispositivo é Bluetooth Low Energy, não apenas Bluetooth
  clássico;
- permita Bluetooth para o site no navegador;
- use HTTPS ou localhost;
- feche outros aplicativos conectados ao adaptador antes de tentar novamente.

## Custos e remoção do ambiente de desenvolvimento

Os recursos são serverless, mas podem gerar cobrança na conta AWS. Acompanhe
uso e orçamento no AWS Billing e remova stacks de teste que não serão mais
usadas.

Para destruir somente a stack de desenvolvimento, confira primeiro a stack
selecionada:

```bash
pulumi -C infra stack select dev
pulumi -C infra preview --destroy
pulumi -C infra destroy
```

Revise cuidadosamente o preview: a remoção apaga os dados da stack `dev`. A
stack `prod` possui proteções adicionais e não deve ser destruída por esse fluxo
sem um plano explícito de retenção e recuperação.

## Segurança e privacidade

- nunca versione `.env.local`, `docs/config.json`, arquivos `.p8`, senhas,
  tokens ou credenciais AWS;
- armazene segredos de provedores com `pulumi config set --secret`;
- prefira perfis com credenciais temporárias e aplique menor privilégio no IAM;
- o authorizer do API Gateway valida o JWT em toda rota privada;
- organização, papel e vínculo com o veículo são consultados no DynamoDB antes
  de cada operação;
- tokens de convite trafegam no corpo e são persistidos somente como SHA-256;
- buckets são privados e os dados do DynamoDB usam criptografia;
- logs não devem conter e-mail, tokens, corpos, query strings ou mensagens cruas
  de exceção.

## Estrutura do repositório

```text
apps/web/        SPA responsiva e cliente OBD2
packages/domain/ regras de negócio e validação compartilhadas
services/api/    handlers Lambda, autorização e persistência
infra/           programa Pulumi para AWS
docs/            especificação, diagramas, configuração e OpenAPI
scripts/         automação de build e deploy
```

## Documentação complementar

- [Especificação técnica](docs/technical-specification.pdf)
- [Decisões de arquitetura](docs/architecture.md)
- [Contrato OpenAPI](docs/openapi.yaml)
- [Exemplo de configuração local](docs/config.example.json)
- [Changelog](CHANGELOG.md)

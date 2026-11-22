# Infraestrutura AWS do AutoKeep

O projeto mantém em Pulumi os recursos existentes e permite habilitar a
hospedagem do frontend e da API separadamente em `dev` e `prod`:

- DynamoDB `autokeep-prod` e Lambda `autokeep-api-prod` existentes;
- hosted zone Route 53 `autokeep.negoci.online` existente;
- bucket S3 privado para os arquivos de `dist/web`;
- CloudFront com HTTPS padrão, função de rewrite SPA e comportamento `/api/*`;
- API Gateway HTTP `$default` integrado à Lambda em payload 2.0.

A hospedagem permanece desativada por padrão (`hostingEnabled: false`).
A stack `dev` usa seu próprio domínio CloudFront e oferece a opção de login com
Google.

## Domínio

O professor já delegou `autokeep.negoci.online` aos quatro nameservers da
hosted zone. Com `customDomainEnabled: true`, o Pulumi cria um certificado ACM
com validação DNS, publica os registros Route 53 e adiciona o alias ao
CloudFront. A propagação da delegação ainda precisa ser confirmada antes de
considerar o HTTPS do domínio pronto.

## Custos e limite da conta

A hosted zone existente custa US$ 0,50/mês, mais consultas; essa cobrança já
foi autorizada. CloudFront usa preço por uso, com franquia mensal de 1 TB de
transferência, 10 milhões de requisições e 2 milhões de invocações da CloudFront
Function. API Gateway HTTP não tem taxa mínima e oferece até 1 milhão de
chamadas por mês por até 12 meses para contas elegíveis. S3 cobra por
armazenamento, requisições e transferência. ACM para certificado público
usado com CloudFront não tem cobrança pelo certificado.

A console AWS consultada em 18/11/2026 mostrou plano Free, US$ 140 em créditos
ativos e custo acumulado estimado de US$ 0. O plano cobre os custos enquanto
estiver ativo, mas o acesso acaba quando o plano vencer ou os créditos
terminarem. A data observada para o fim do plano é 23/03/2027. Franquias não
são um limite de gasto e um orçamento da AWS apenas alerta; não interrompe
recursos automaticamente. Não ativar `hostingEnabled` nem executar `pulumi up`
sem revisar o preview e informar antes o custo/limite estimado da etapa.

## Preparar no Codespaces

As credenciais AWS e o token Pulumi ficam nos secrets do Codespace; não os
copie para o repositório ou terminal de saída.

Na raiz do repositório:

```sh
npm ci
npm run build
npm run build:lambda
```

No projeto Pulumi:

```sh
cd pulumi-start-aws
npm ci
npm run check
pulumi login
pulumi stack select prod
pulumi preview --diff
```

Com hospedagem desativada, o preview deve mostrar somente a importação da
hosted zone existente `Z034110231W3QV3DHBMS`. A importação associa a zona ao
Pulumi; não cria outra zona nem configura registros da aplicação.

## Ativação da hospedagem

A ativação de `prod` é deliberada. O primeiro deploy usa o domínio
Vercel atual como `appOrigin` durante a criação dos recursos; depois que o
preview/aplicação criar a distribuição, atualize a origem para a URL CloudFront
exportada. Isso preserva os demais valores de ambiente da Lambda como segredo.

```sh
pulumi config set autokeep:hostingEnabled true --stack prod
pulumi config set autokeep:appOrigin https://autokeep-olive.vercel.app --stack prod
pulumi preview --diff
```

Revise cada recurso e custo antes de aplicar. Após a distribuição existir, use
`cloudFrontUrl` exportada como `appOrigin`, gere um novo preview e aplique a
atualização da Lambda. Só então teste `/api/health`, login, cookies, operações
de gravação e rotas da SPA pelo endereço CloudFront.

Quando o subdomínio estiver delegado:

```sh
pulumi config set autokeep:appOrigin https://autokeep.negoci.online --stack prod
pulumi config set autokeep:customDomainEnabled true --stack prod
pulumi preview --diff
```

Aguarde a validação do certificado e a distribuição CloudFront concluir. Teste
HTTPS, DNS, `/api/health`, login e gravação antes de remover o deployment Vercel.

## Login com Google em dev

Gere os artefatos com `npm run build` e `npm run build:lambda` na raiz. No projeto
Pulumi, selecione a stack `dev` e habilite a hospedagem:

```sh
pulumi config set autokeep:hostingEnabled true --stack dev
pulumi config set autokeep:appOrigin http://localhost:8080 --stack dev
pulumi preview --stack dev --diff
```

Após revisar e aplicar esse preview, consulte `pulumi stack output cloudFrontUrl
--stack dev`. A origem inicial serve para provisionar a distribuição. Use a URL
exportada para configurar o OAuth antes de testar o login.

1. No Google Cloud, crie um cliente OAuth do tipo **Aplicativo da Web**. Cadastre
   a URL CloudFront seguida de `/api/auth/google/callback` como URI de
   redirecionamento autorizada. Se a tela de consentimento estiver em modo de
   teste, inclua os usuários que vão validar o login.
2. No Secrets Manager da mesma conta, em `us-east-1`, crie um segredo usando a
   chave gerenciada padrão do serviço. Armazene o segredo do cliente como texto
   puro no valor do segredo, sem JSON. Copie somente o ARN para a configuração.
3. Configure os valores e revise o segundo preview:

   ```sh
   pulumi config set autokeep:appOrigin https://DISTRIBUICAO.cloudfront.net --stack dev
   pulumi config set autokeep:googleClientId CLIENT_ID --stack dev
   pulumi config set autokeep:googleClientSecretArn ARN_DO_SEGREDO --stack dev
   pulumi preview --stack dev --diff
   ```

O segundo preview inclui a permissão `secretsmanager:GetSecretValue` na role
`autokeep-api-dev` para o ARN indicado. A Lambda deve ter saída HTTPS para as
APIs públicas do Google e acesso ao Secrets Manager. A role existente precisa
das operações `GetItem`, `PutItem`, `DeleteItem` e `Query` na tabela
`autokeep-dev`. O cadastro transacional usa operações `Put`.

Após aplicar o preview, confira a URL com `pulumi stack output googleCallbackUrl
--stack dev`. Pelo domínio CloudFront, teste vincular uma conta existente com a
senha do AutoKeep, sair e entrar com Google e criar uma conta com um espaço
próprio em **Meu carro** ou **Gestão de frota**. Para testar o acesso de
**Motorista** a uma frota existente, use um convite válido para outro usuário.
Confira se `/api/session` retorna só os espaços e papéis desse usuário.

## Recursos preservados

As roles IAM existentes permanecem fora do gerenciamento deste projeto. O
Pulumi gerencia a política inline de leitura do segredo OAuth da role dev.
As tabelas usam 5 RCU/5 WCU cada, TTL `ttl`, sem PITR e chave AWS-owned. A Lambda
usa Node.js 24.x, handler `index.handler`, 256 MB, timeout 15 s e armazenamento
temporário de 512 MB. Com `hostingEnabled` ligado, o Pulumi publica o ZIP gerado
por `npm run build:lambda` e atualiza `APP_ORIGIN` e `DYNAMODB_TABLE`, além da
configuração Google quando a stack é `dev`. Os demais valores de ambiente são
preservados como segredo.

O bucket, CloudFront, API Gateway, integração e permissões de invocação usam
`protect` e `retainOnDelete`. Não use `pulumi destroy` para desligar a
hospedagem; revise remoções recurso a recurso e custos de retenção primeiro.

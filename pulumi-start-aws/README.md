# Infraestrutura AWS do AutoKeep

O projeto mantém em Pulumi os recursos existentes e prepara, somente na stack
`prod`, a hospedagem do frontend e da API:

- DynamoDB `autokeep-prod` e Lambda `autokeep-api-prod` existentes;
- hosted zone Route 53 `autokeep.negoci.online` existente;
- bucket S3 privado para os arquivos de `dist/web`;
- CloudFront com HTTPS padrão, função de rewrite SPA e comportamento `/api/*`;
- API Gateway HTTP `$default` integrado à Lambda em payload 2.0.

A hospedagem permanece desativada por padrão (`hostingEnabled: false`). A stack
`dev` continua apenas com os recursos existentes. Nenhum recurso AWS foi
provisionado por esta alteração.

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

A ativação é deliberada e restrita a `prod`. O primeiro deploy usa o domínio
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

## Recursos preservados

As roles IAM existentes permanecem fora do gerenciamento deste projeto. As
tabelas usam 5 RCU/5 WCU cada, TTL `ttl`, sem PITR e chave AWS-owned. A Lambda
usa Node.js 24.x, handler `index.handler`, 256 MB, timeout 15 s e armazenamento
temporário de 512 MB. Com `hostingEnabled` ligado, o Pulumi publica o ZIP gerado
por `npm run build:lambda` e atualiza somente `APP_ORIGIN` e
`DYNAMODB_TABLE`, preservando as outras variáveis existentes como secreto.

O bucket, CloudFront, API Gateway, integração e permissões de invocação usam
`protect` e `retainOnDelete`. Não use `pulumi destroy` para desligar a
hospedagem; revise remoções recurso a recurso e custos de retenção primeiro.

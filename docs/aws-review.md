# Verificação AWS — histórico de 17–18/11/2026

> As tabelas iniciais registram inspeções anteriores à hospedagem, não o estado
> atual completo. A seção final registra o deploy confirmado em 18/11/2026.

Inspeção pelo console autenticado no Chrome, sem extensão. Região de aplicação:
`us-east-1`. Não foram criados recursos nem executados deploys. Após a revisão
e confirmação explícita do usuário, foi excluído somente o grupo de segurança
legado `autokeep-db`, conforme registro abaixo. Revisão limitada aos recursos; não é um inventário
de todas as regiões e serviços da conta.

## Custos e autorização

- Plano atual: Free Plan. O console informa fim em **23/03/2027**, ou antes se
  os créditos terminarem. Não alterar para plano pago automaticamente.
- Créditos estimados disponíveis: **US$ 140,00**; estimado utilizado: US$ 0,00.
  A tela de créditos informa validade nominal em 23/09/2027; isso não estende
  o período do plano gratuito. Valores estimados atualizam com atraso.
- Faturamento detalhado ainda estava preparando os dados; não se conclui que
  todo consumo futuro será zero apenas pelo saldo atual.
- Instrução expressa do usuário: antes de usar qualquer recurso pago,
  inclusive coberto pelos créditos, solicitar autorização com recurso, valor
  estimado e frequência da cobrança.

## Recursos verificados

| Recurso                                         | Estado observado                                                                                                                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DynamoDB `autokeep-dev` e `autokeep-prod`       | Ativas; chaves String `pk`/`sk`; Standard; cada uma com 5 RCU e 5 WCU provisionados.                                                                                         |
| DynamoDB adicionais                             | Sem índices ou replicação; autoscaling e PITR desligados; criptografia com chave AWS-owned; TTL ativo no atributo `ttl`.                                                     |
| Proteção contra exclusão                        | Desligada nas duas tabelas. Não alterada nesta inspeção.                                                                                                                     |
| Lambda `autokeep-api-dev` e `autokeep-api-prod` | Existem em Node.js 24.x, com Function URLs.                                                                                                                                  |
| Lambda produção                                 | Handler `index.handler`, memória 256 MB, armazenamento temporário 512 MB, timeout 15s; sem concorrência provisionada; concorrência compartilhada da conta informada como 10. |
| Ambiente produção                               | `DYNAMODB_TABLE=autokeep-prod`, `APP_ORIGIN=https://autokeep-olive.vercel.app`, `SEED_DEMO=true`. Segredo de demonstração não reproduzido neste documento.                   |
| Ambiente dev                                    | `DYNAMODB_TABLE=autokeep-dev`, mesma origem do site de produção, `SEED_DEMO=false`. Origem própria de preview/dev ainda precisa ser definida se houver frontend separado.    |
| IAM das Lambdas                                 | Roles separadas dev/prod; GetItem, PutItem, DeleteItem, Query e UpdateItem restritos à tabela correspondente; logs restritos ao grupo correspondente.                        |
| API Gateway                                     | Lista sem APIs em us-east-1.                                                                                                                                                 |
| CloudFront                                      | Sem distribuições na lista global.                                                                                                                                           |
| S3                                              | Sem buckets de uso geral na lista de todas as regiões.                                                                                                                       |
| RDS                                             | Zero instâncias, clusters e snapshots no painel us-east-1.                                                                                                                   |
| Route 53                                        | Hosted zone pública `autokeep.negoci.online` criada em 18/11/2026 na conta 672791231338. Apenas NS e SOA; delegação no domínio pai e registros da aplicação pendentes. O dashboard de registro de domínio não confirmou domínios registrados. |

## Validação da aplicação publicada

GET `https://autokeep-olive.vercel.app/api/health` e GET `/api/health` na
Function URL de produção retornaram `{"status":"ok"}`. Isso valida a
conectividade básica dessas entradas, sem comprovar todos os fluxos de negócio
nem que a Vercel encaminha sua API para a Lambda. O checkout inspecionado
configurava uma função própria da Vercel, com acesso direto ao DynamoDB.

Não foram feitos testes de carga nem reproduzidas senhas, cookies ou chaves.

## DNS e próxima configuração

A zona pública `autokeep.negoci.online` foi criada em 18/11/2026 após autorização
do usuário. ID `Z034110231W3QV3DHBMS`; nameservers `ns-1293.awsdns-33.org`,
`ns-203.awsdns-25.com`, `ns-622.awsdns-13.net` e `ns-1563.awsdns-03.co.uk`.
Ela contém somente os registros NS e SOA padrão. O administrador de
`negoci.online` precisa delegar o subdomínio com um registro NS para que a zona
AWS responda publicamente. Os registros A/AAAA/CNAME para a aplicação dependem
de decidir onde o frontend e a API serão servidos.

A hosted zone pública Route 53 tem preço base de US$ 0,50/mês para as primeiras
25 zonas, mais consultas cobradas conforme tipo e volume. O console de créditos
indicou que Route 53 é elegível ao crédito Free Tier ativo; o crédito pode
compensar essa cobrança enquanto houver saldo e validade. Créditos não são um
limite de gastos. Registro de domínio é uma cobrança separada; nenhum domínio
foi registrado nesta ação.

Fontes oficiais de preços:

- https://aws.amazon.com/route53/pricing/
- https://aws.amazon.com/dynamodb/pricing/

As duas tabelas somam 10 RCU e 10 WCU, abaixo da franquia publicada de 25 de
cada para DynamoDB Standard provisionado. Isso não garante custo total zero:
armazenamento, tráfego, logs, invocações e outras opções têm limites próprios.
Manter os adicionais desativados e revisar o consumo durante o uso.

## Revisão de redundância e remanescentes

Nova consulta ao console em 17/11/2026, sem alteração/exclusão:

| Achado                                                              | Avaliação / ação                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tabela e Lambda por ambiente dev/prod                               | Separação intencional; manter. Não confundir dois ambientes com duplicação descartável.                                                                                                                                                                                                                                     |
| API da Vercel e Lambdas AWS                                         | Possível sobreposição de hospedagem: o checkout configura Vercel Function própria. Não foi comprovado o caminho do deploy ativo; manter as Lambdas até confirmar integração e exigências da disciplina.                                                                                                                     |
| Grupo de segurança `autokeep-db` (`sg-0ef4b7f823e0fdf39`)           | Remanescente do RDS antigo. Dependências verificadas e exclusão concluída após confirmação explícita do usuário; veja o registro abaixo. Não era necessário para DynamoDB ou Codespaces. |
| Grupo `default`, VPC padrão, 6 subnets, 1 rota e 1 internet gateway | Configuração base da região; não remover apenas por não estar sendo usada pela aplicação.                                                                                                                                                                                                                                   |
| EC2 em us-east-1                                                    | Painel confirmou zero instâncias totais/rodando, volumes, snapshots, Elastic IPs, load balancers e Auto Scaling Groups. Não há esses componentes para desativar nesta região.                                                                                                                                               |
| VPC em us-east-1                                                    | Painel confirmou zero NAT gateways, endpoints, serviços de endpoint, VPNs site-to-site e conexões de peering.                                                                                                                                                                                                               |
| Métricas Lambda dev                                                 | Na janela padrão de 3 horas, console mostrou ausência de dados. Isso não comprova desuso histórico e não justifica exclusão.                                                                                                                                                                                                |

Grupos de segurança e a configuração base de VPC, por si só, não têm uma
cobrança de instância para economizar removendo-os. Não houve identificação
de recurso pago redundante comprovadamente seguro para excluir nesta revisão.
Não é uma auditoria exaustiva de todas as regiões, IAM, logs e serviços AWS.

Identidade AWS, backend e stacks Pulumi foram posteriormente consultados no
Codespaces: mesma conta, usuário `autokeep-deploy`, somente stack `dev` vazia
e nenhuma `prod` AutoKeep acessível. Veja [o registro](codespaces-validation.md).
O deploy Vercel foi conferido abaixo.
Não copiar os secrets para o checkout. O [guia de Codespaces](codespaces.md)
explica a separação entre banco local, dev AWS e prod AWS.

## Remoção concluída de `autokeep-db`

Após autorização para prosseguir, foi aberto o painel **Related resources** do
grupo `sg-0ef4b7f823e0fdf39` em `us-east-1`. O painel investigou **132 tipos de
recursos** e mostrou somente três relações: as duas regras do próprio grupo e
a VPC `vpc-0c530375feb3c3864`. Não foram mostrados workloads associados.
As regras são entrada MySQL/TCP 3306 restrita a um IPv4 /32 e saída IPv4 geral.
Não há necessidade de preservar esse grupo para DynamoDB ou Codespaces.

Após confirmação explícita do usuário, foi excluído apenas esse grupo em
17/11/2026. O console confirmou **Security group (sg-0ef4b7f823e0fdf39 |
autokeep-db) successfully deleted** e a lista passou de dois para um grupo,
restando somente `default` (`sg-0d927a00379cc6393`).

Tabelas, Lambdas, roles e a VPC padrão foram preservadas. A ação não criou
recursos nem introduziu cobrança adicional. A remoção é de uma configuração
legada e não representa economia de uma instância ou banco em execução.

## Caminho da API Vercel confirmado

Foi acessado o projeto `autokeep` no painel Vercel, sem alterar configurações.
O deployment de produção `JGNMppNdTDU52TkN8RZjnnNx73ii` está **Ready** e
atende `autokeep-olive.vercel.app`. A origem é a branch `main`, commit
`ac69017438c754fbc9cd6337b4be52f421832e75`.

A página **Resources** confirmou uma Vercel Function em `/api/index`, Node.js
24.x. A página **Source** mostrou o `vercel.json` publicado: `/api/:path*`
é reescrito para `/api/index?__route=:path*`. O handler desse mesmo commit
chama `createCloudApp()` diretamente, com persistência DynamoDB; não faz proxy
para as Function URLs AWS.

Portanto, as Lambdas AWS não são necessárias ao caminho documentado desse
site Vercel. Isso não comprova que nenhum outro cliente as usa. Elas continuam
preservadas para os ambientes AWS e para a milestone de publicação Lambda.
Uma decisão futura pode integrar o site à Lambda para a entrega acadêmica ou
remover as funções AWS se a entrega permitir. Não apagar tabelas/roles por
consequência automática dessa constatação.

Nenhum deployment, secret, domínio ou configuração Vercel foi alterado. A
refatoração e o suporte Codespaces locais ainda não substituíram esse deploy.

## Hospedagem AWS aplicada — 18/11/2026

A console de Billing consultada nesta data mostrou plano Free, US$ 140,00 em
créditos ativos, uso estimado de US$ 0,00 e fim do plano em 23/03/2027. O resumo
informava que créditos cobrem o plano gratuito e que o acesso termina quando o
plano vencer ou os créditos acabarem. Não havia orçamento configurado. Um
orçamento cria alertas, mas não é limite rígido de consumo.

O Pulumi executou a stack `prod`, atualização #10, no Codespace: **4 recursos
criados e 36 inalterados**, sem erro. Os recursos novos foram a distribuição
CloudFront, a policy do bucket e registros Route 53 A/AAAA. A CloudFront
Function `autokeep-prod-spa-rewrite` foi publicada em `LIVE` antes da aplicação.
O bucket S3 é privado; o API Gateway HTTP integra com `autokeep-api-prod` e a
tabela `autokeep-prod`.

O certificado ACM e os aliases DNS estão ativos na zona delegada
`autokeep.negoci.online`. O site foi aberto com sucesso em
`https://autokeep.negoci.online`. Isso confirma entrega da página; login,
gravações e isolamento de dados ainda precisam de teste ponta a ponta no
ambiente AWS.

O arquivo versionado de produção deve manter `hostingEnabled: true`,
`customDomainEnabled: true` e `appOrigin: https://autokeep.negoci.online` para
representar a implantação. A configuração local reproduzida e os comandos
atuais estão no [guia Pulumi](../pulumi-start-aws/README.md).

Créditos e franquias não são um teto de consumo, e os preços variam por uso.
Esta inspeção não calcula custo futuro nem autoriza serviços adicionais. Rever
Billing periodicamente e obter autorização para qualquer recurso pago novo.

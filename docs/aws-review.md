# Verificação AWS — 17/11/2026

Inspeção pelo console autenticado no Chrome, sem extensão. Região de aplicação:
`us-east-1`. Não foram criados recursos, executados deploys nem alteradas
configurações AWS. Revisão limitada aos recursos abaixo; não é um inventário
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

| Recurso | Estado observado |
| --- | --- |
| DynamoDB `autokeep-dev` e `autokeep-prod` | Ativas; chaves String `pk`/`sk`; Standard; cada uma com 5 RCU e 5 WCU provisionados. |
| DynamoDB adicionais | Sem índices ou replicação; autoscaling e PITR desligados; criptografia com chave AWS-owned; TTL ativo no atributo `ttl`. |
| Proteção contra exclusão | Desligada nas duas tabelas. Não alterada nesta inspeção. |
| Lambda `autokeep-api-dev` e `autokeep-api-prod` | Existem em Node.js 24.x, com Function URLs. |
| Lambda produção | Handler `index.handler`, memória 256 MB, armazenamento temporário 512 MB, timeout 15s; sem concorrência provisionada; concorrência compartilhada da conta informada como 10. |
| Ambiente produção | `DYNAMODB_TABLE=autokeep-prod`, `APP_ORIGIN=https://autokeep-olive.vercel.app`, `SEED_DEMO=true`. Segredo de demonstração não reproduzido neste documento. |
| Ambiente dev | `DYNAMODB_TABLE=autokeep-dev`, mesma origem do site de produção, `SEED_DEMO=false`. Origem própria de preview/dev ainda precisa ser definida se houver frontend separado. |
| IAM das Lambdas | Roles separadas dev/prod; GetItem, PutItem, DeleteItem, Query e UpdateItem restritos à tabela correspondente; logs restritos ao grupo correspondente. |
| API Gateway | Lista sem APIs em us-east-1. |
| CloudFront | Sem distribuições na lista global. |
| S3 | Sem buckets de uso geral na lista de todas as regiões. |
| RDS | Zero instâncias, clusters e snapshots no painel us-east-1. |
| Route 53 | Zero hosted zones. O dashboard de registro de domínio apresentou erro; não foi possível confirmar por ele se há domínios registrados. |

## Validação da aplicação publicada

GET `https://autokeep-olive.vercel.app/api/health` e GET `/api/health` na
Function URL de produção retornaram `{"status":"ok"}`. Isso valida a
conectividade básica dessas entradas, sem comprovar todos os fluxos de negócio
nem que a Vercel encaminha sua API para a Lambda. O checkout inspecionado
configurava uma função própria da Vercel, com acesso direto ao DynamoDB.

Não foram feitos testes de carga nem reproduzidas senhas, cookies ou chaves.

## DNS e próxima configuração

Não criar hosted zone sem um domínio ou subdomínio de propriedade do usuário
e sem saber quem administra sua delegação. Foi solicitado o nome do domínio e
o registrador. O hostname gratuito atual da Vercel não exige uma zona Route 53.

Se houver domínio próprio: obter da hospedagem os valores exatos de registros
e verificação, preservar registros de email e configurar a origem da API para
o hostname final. Não inventar endereços IP ou trocar nameservers sem conferir
a delegação existente.

A hosted zone pública Route 53 tem preço base de US$ 0,50/mês para as primeiras
25 zonas, mais consultas cobradas conforme tipo e volume. Registro de domínio
é outra cobrança e não é coberto por créditos promocionais. Nenhuma zona ou
domínio foi criado; qualquer opção paga depende da autorização solicitada.

Fontes oficiais de preços:

- https://aws.amazon.com/route53/pricing/
- https://aws.amazon.com/dynamodb/pricing/

As duas tabelas somam 10 RCU e 10 WCU, abaixo da franquia publicada de 25 de
cada para DynamoDB Standard provisionado. Isso não garante custo total zero:
armazenamento, tráfego, logs, invocações e outras opções têm limites próprios.
Manter os adicionais desativados e revisar o consumo durante o uso.

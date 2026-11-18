# AutoKeep

Aplicação em português para acompanhar veículos, frotas e trocas de óleo.
React/TypeScript e uma única API Express usam DynamoDB em todos os ambientes:
DynamoDB Local no Docker, tabelas existentes na AWS em dev/prod.

## GitHub Codespaces

O ambiente inclui configuração em `.devcontainer/devcontainer.json` para Node,
Docker/Compose e AWS CLI. No Codespace existente, reconstrua o container e execute
`npm run dev`; abra a porta 8080 em **Ports**, mantendo a visibilidade privada.
A porta 8025 abre o Mailpit. As URLs/origem são ajustadas automaticamente.

Os secrets AWS do Codespaces ficam reservados às operações explícitas no
terminal. O Docker usa DynamoDB Local e credenciais fictícias, sem consumir AWS.
Veja [o guia de Codespaces](docs/codespaces.md) para execução, secrets, stacks,
diagnóstico e limites da validação.

## Desenvolvimento local

Requisitos: Node.js 22.12+ e Docker com Compose em execução.

```sh
npm run dev
```

Abra http://localhost:8080. O script cria `.env` com uma senha aleatória,
compila o container, aguarda o DynamoDB Local, cria a tabela local e gera dados
de demonstração no primeiro acesso. Não usa uma conta AWS nem créditos.

```sh
npm run credentials
npm run down
```

Perfis: `ana@autokeep.local` (garagem), `marina@autokeep.local` (gestora) e
`lucas@autokeep.local` (motorista). Convites locais são capturados pelo Mailpit
em http://localhost:8025. Apenas aplicação e Mailpit são publicados no loopback;
o banco fica na rede interna Docker. `npm run deve` é alias de `npm run dev`.

Os dados ficam no volume `autokeep-local_dynamodb-data`. Parar/recriar os
containers preserva o banco. Não use `down -v` se quiser manter os dados.

**Mudança de MySQL para DynamoDB:** não há migração automática dos dados antigos.
O volume MySQL existente não é apagado por esta refatoração. Preserve-o e exporte
seus dados antes de qualquer remoção; o novo ambiente começa com banco próprio.
Não há mais dependência de senhas/variáveis MySQL no `.env`.

## Funcionalidades

- Garagem pessoal e frota, organizações e seleção do espaço ativo.
- Perfis ADMIN/DRIVER, atribuição de veículos e isolamento por organização.
- Leituras reais, histórico, trocas de óleo, arquivamento e auditoria.
- Convites de sete dias, com hash do token e cadastro/aceitação.
- Duplo relógio de manutenção: 5.000/8.000/12.000 km conforme óleo ou 365 dias.
- Pré-alertas a 500 km/30 dias, média das três últimas leituras e projeção.
- Notificações persistidas e deduplicadas, com marcação de leitura.

Notificações são avaliadas ao consultar a caixa de avisos de cada organização.
Não há worker em background: sem abrir o app não são gerados novos avisos nem
emails. Essa escolha elimina o worker MySQL duplicado e não adiciona um
agendador pago. Emails são enviados somente ao Mailpit local, quando configurado;
em nuvem, os convites oferecem link copiável. Push remoto, email real e leitura
automática de hardware OBD2 continuam pendentes. O modo OBD2 aceita somente
valor confirmado pelo usuário. O app exige conexão; não há operação offline.

## Verificação e build

```sh
npm ci
npm test
npm run test:integration
npm run build
npm run build:lambda
```

`npm test` valida regras de manutenção. A integração sobe um container DynamoDB
Local descartável, em porta aleatória de loopback, testa a API real e encerra o
container. Nunca usa AWS e não toca o banco de desenvolvimento. É necessário
Docker; no primeiro uso a imagem pode precisar ser baixada.

O build web fica em `dist/web`; o pacote Lambda em `dist/autokeep-lambda.zip`
com `index.handler`, Node.js 24.x. Esses comandos não publicam nada.

## Ambientes publicados

A auditoria do console em 17/11/2026 confirmou na região `us-east-1`:

| Ambiente | DynamoDB        | Lambda              |
| -------- | --------------- | ------------------- |
| dev      | `autokeep-dev`  | `autokeep-api-dev`  |
| prod     | `autokeep-prod` | `autokeep-api-prod` |

As tabelas usam `pk`/`sk` String, classe Standard, 5 RCU e 5 WCU cada e TTL `ttl`.
Não há API Gateway/CloudFront/Route 53 configurados na conta auditada. A Lambda
prod usa Function URL e o frontend está em https://autokeep-olive.vercel.app.
O endpoint `/api/health` do site e da Lambda prod foi validado na auditoria.
Esta branch não foi publicada; o comportamento novo só passa à nuvem após deploy.

A mesma `createApp()` atende servidor local, função Vercel (`api/index.ts`) e
Lambda (`lambda/index.ts`). No deploy atual, o painel Vercel confirmou uma
função própria `/api/index` e o rewrite de `/api/*` para ela, a partir do commit
`ac69017` da main. Esse caminho não usa as Function URLs AWS. As Lambdas foram
preservadas para os ambientes e requisitos AWS; nada foi republicado nesta revisão.
Não há duas implementações de regras de negócio na branch de refatoração.

Variáveis cloud: `AWS_REGION`, `DYNAMODB_TABLE`, `APP_ORIGIN`, `SEED_DEMO` e,
se o seed estiver ligado, `DEMO_PASSWORD` com pelo menos 16 caracteres. Lambda
usa suas credenciais temporárias de execution role; Vercel precisa de credenciais
restritas à tabela. Não copie credenciais cloud para o Docker local. A configuração
existente mantém as tabelas e roles separadas; dev tem seed desativado.

## Infraestrutura e custos

[pulumi-start-aws](pulumi-start-aws/README.md) suporta stacks chamadas `dev` e
`prod` e referencia os recursos existentes, sem criar/recriar tabelas, Lambdas
ou DNS. A consulta real ao backend encontrou somente `dev`, com zero recursos;
`prod` não foi encontrada entre as stacks AutoKeep acessíveis. Os ambientes
AWS existentes ainda não estão gerenciados por esse estado Pulumi. Veja
[a validação no Codespaces](docs/codespaces-validation.md).
Veja [a auditoria AWS](docs/aws-review.md) para o estado real, créditos e limites.
Não execute provisionamento/deploy nem introduza consumo pago, mesmo coberto
por créditos, sem primeiro informar recurso/valor e obter autorização explícita.

A política em `infra/autokeep-dynamodb-policy.json` é um exemplo exclusivo de dev;
não deve ser aplicada à role de prod. Não habilite RDS, NAT Gateway, PITR, KMS
próprio, auto scaling ou outros serviços apenas para cumprir um diagrama.
Registro de domínio no Route 53 não é coberto por créditos promocionais.

## Estrutura

```text
src/web/          interface React
src/shared/       contratos e regras de manutenção
src/server/       API única, persistência DynamoDB e SMTP local opcional
api/              adaptador Vercel
lambda/           adaptador AWS Lambda
pulumi-start-aws/  referências à infraestrutura existente
scripts/          desenvolvimento, build, credenciais e testes locais
tests/            testes de regras e integração com DynamoDB Local
docs/             especificação original, decisões e auditorias
```

Nenhum commit desta branch é publicado automaticamente.

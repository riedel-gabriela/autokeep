# AutoKeep

Cuide do seu carro e da sua frota. Aplicação responsiva em português, com React,
TypeScript, API Node.js e MySQL 8.0 no Docker local.

## Rodar localmente

Requisitos: Node.js 22.12 ou superior e Docker com Compose, em execução.
Docker Desktop ou Colima com `docker-compose` também são aceitos.

```sh
npm run dev
```

Abra **http://localhost:8080**. O comando cria o `.env` com senhas aleatórias,
constrói a imagem, inicia o MySQL, aplica as migrações e cria dados de exemplo
somente quando o banco está vazio. O primeiro início pode levar alguns minutos.
Não é necessário instalar as dependências no host para esse comando.

`npm run deve` é um alias de `npm run dev`.

Em outro terminal, consulte os acessos locais:

```sh
npm run credentials
```

| Perfil          | E-mail                  | Permissões                                 |
| --------------- | ----------------------- | ------------------------------------------ |
| Garagem pessoal | `ana@autokeep.local`    | Gerencie os próprios veículos e trocas     |
| Gestão de frota | `marina@autokeep.local` | Gerencie veículos, motoristas e manutenção |
| Motorista       | `lucas@autokeep.local`  | Consulte veículos atribuídos e atualize km |

A senha gerada é compartilhada pelos perfis de demonstração. O login usa
hash bcrypt e sessão opaca com expiração, persistida no banco. Esse provedor
local é bloqueado quando `NODE_ENV=production`.

Os e-mails de convites e alertas são capturados pelo **Mailpit** em
**http://localhost:8025**. Nenhuma mensagem é enviada para a internet.

## Uso

- **Meu carro:** consulte a próxima troca por tempo e quilometragem, registre
  leituras e trocas de óleo, acompanhe a média diária e o histórico.
- **Frota:** veja alertas e situação dos veículos, pesquise e filtre, convide
  motoristas e atribua ou desatribua veículos preservando todo o histórico.
- **Convites:** copie o link ou abra o e-mail no Mailpit. O destinatário pode
  criar sua conta pelo convite ou entrar com uma conta existente. Válido por
  sete dias; apenas o hash do token fica no banco.
- **Notificações:** consulte avisos de manutenção e calibração no aplicativo.
  O avaliador local é executado ao iniciar e a cada 15 minutos.
- **Espaços:** crie garagens e frotas adicionais e alterne pelo menu lateral.

## Parar e persistir

Use `Ctrl+C` no terminal do desenvolvimento para parar os serviços ou:

```sh
npm run down
```

Os dados ficam no volume `autokeep-local_mysql-data`. Parar/recriar os
containers preserva os dados. Preserve também o `.env`: trocar a senha nele
não altera automaticamente a senha de um banco que já foi inicializado.
Não use `down -v` se quiser manter os dados.

Somente a aplicação (`8080`) e a caixa de e-mails (`8025`) são publicadas no
loopback. O MySQL fica acessível apenas pela rede interna do Compose.
As pastas de código são montadas no container com atualização automática.
Depois de alterar dependências, execute `npm run dev` novamente para reconstruir.

## Compilar no host

Para usar editor, TypeScript e compilação no host:

```sh
npm ci
npm run build
```

O build gera a SPA em `dist/web`. A API local usa MySQL; a função da Vercel
usa DynamoDB Standard na AWS.

## Estrutura

```text
src/web/        interface React responsiva
src/shared/     tipos e regras de manutenção independentes da interface
src/server/     API, autorização, MySQL, e-mails e avaliador de alertas
db/             migrações SQL versionadas
scripts/        inicialização Docker e consulta dos acessos locais
public/         identidade visual e manifest de instalação
docs/           requisitos originais e decisões de implementação
```

## Frontend na Vercel

O arquivo `vercel.json` define o preset Vite, a instalação das dependências de
build, o comando `npm run build` e a saída `dist/web`.

Nas configurações do projeto Vercel, use a raiz do repositório (`.`) como
**Root Directory**. Remova referências à estrutura antiga `apps/web`.
Essa configuração de raiz é feita no painel da Vercel; `vercel.json` não a altera.

O deploy publica a interface Vite e a API em uma Vercel Function. Ela acessa
uma única tabela DynamoDB, `autokeep-dev`, na região `us-east-1`. A tabela usa
`pk` e `sk` como chaves String, classe Standard, modo provisionado com 5 RCU e
5 WCU fixos, sem índices, backups contínuos, replicação ou KMS próprio.
Esses valores cabem na cota gratuita de 25 RCU, 25 WCU e 25 GB por conta;
tráfego acima da capacidade é limitado pelo DynamoDB. Armazenamento e outros
recursos AWS fora da cota podem gerar consumo de créditos. Consulte os limites
atuais na [página oficial de preços](https://aws.amazon.com/dynamodb/pricing/).

Crie uma identidade de aplicação sem acesso ao console e restrinja-a à tabela
com [esta política](infra/autokeep-dynamodb-policy.json). Configure as seguintes
variáveis secretas no projeto Vercel: `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `AWS_REGION=us-east-1`,
`DYNAMODB_TABLE=autokeep-dev`, `APP_ORIGIN=https://<domínio do projeto>`,
`SEED_DEMO=true` e `DEMO_PASSWORD` (senha aleatória com pelo menos 16 caracteres,
diferente do Docker). O primeiro acesso cria três perfis de demonstração:
`ana@autokeep.local`, `marina@autokeep.local` e `lucas@autokeep.local`, com um
veículo atribuído ao motorista. Use `/api/health` para verificar a conexão.
No checkout usado para publicar, consulte a senha com
`npm run credentials -- --cloud`. O arquivo `.env.cloud.local` é local e
ignorado pelo Git.

Os convites publicados devolvem um link para copiar; não enviam e-mail. A
avaliação periódica de notificações continua exclusiva do Docker local.

## AWS e Pulumi

O ambiente publicado usa uma tabela DynamoDB da cota gratuita. A estrutura
Pulumi de duas stacks isoladas, `dev` e `prod`, permanece como próximo passo;
nenhuma segunda tabela foi criada para não duplicar capacidade agora.

O pacote da API para AWS Lambda pode ser gerado localmente com
`npm run build:lambda`. O arquivo fica em `dist/autokeep-lambda.zip`, com
handler `index.handler` para Node.js 24.x. A Lambda ainda não foi criada nem
associada ao site: a publicação atual continua usando a função da Vercel.

Consulte [as decisões e a cobertura dos requisitos](docs/implementation.md).

Sem commits ou pushes automáticos.

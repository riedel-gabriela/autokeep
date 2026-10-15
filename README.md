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

O build gera a SPA em `dist/web`. A API usa `createApp()` separado do ponto de
entrada HTTP e o avaliador de manutenção tem uma função independente, para
permitir os adaptadores Lambda e EventBridge na etapa de infraestrutura.

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

Esse deploy publica a interface estática. O servidor Express, o MySQL e o
Mailpit são serviços do Docker local e não são iniciados pela Vercel. Login e
dados precisam de uma API publicada e conectada ao banco antes de funcionarem
no endereço público. A infraestrutura de nuvem continua sendo uma etapa separada.

## AWS e Pulumi

O ambiente atual é **local** e não provisiona recursos AWS. Custo zero
recorrente na AWS com MySQL gerenciado não é garantido pelo Free Tier.

Na fase de nuvem, um projeto Pulumi terá duas stacks isoladas, `dev` e `prod`,
com funções Lambda, banco MySQL gerenciado, frontend estático e identidade
externa. `npm run dev` continuará sendo o fluxo local. `pulumi up --stack dev`
provisionará o ambiente de nuvem; uma stack de produção não executa Vite ou
Docker Compose. DNS, CI/CD e infraestrutura ficam para essa etapa.

Consulte [as decisões e a cobertura dos requisitos](docs/implementation.md).

Sem commits ou pushes automáticos.

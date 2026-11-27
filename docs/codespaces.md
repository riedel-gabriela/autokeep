# Desenvolvimento no GitHub Codespaces

Codespaces executa o ambiente local e fornece o terminal para operações
explícitas na AWS. Não é uma terceira stack AWS. Use o Codespace existente
com a branch que deseja testar.

## Rodar a aplicação

Requisitos: Node.js 22.12+ e Docker/Compose disponíveis. Se necessário,
reconstrua o dev container pela opção **Codespaces: Rebuild Container**.

```sh
npm ci
npm run dev
```

Abra a porta **8080** na aba **Ports**, com visibilidade **Private**. Clique
em **Entrar** para abrir a garagem pessoal de teste. Não há senha nem acesso
Google neste fluxo. O banco é DynamoDB Local, em volume persistente.

O script deriva a origem HTTPS de `CODESPACE_NAME` e
`GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN`. Essa origem é usada nos cookies e
na validação das escritas. Não copie o domínio de produção para a configuração
local. O Vite aceita o hostname específico do Codespace.

Para parar e preservar os dados:

```sh
npm run down
```

## Testar

```sh
npm test
npm run test:integration
npm run build
npm run build:lambda
```

A integração usa um DynamoDB Local temporário e recusa endpoints cloud.
O Compose usa credenciais fictícias para `http://db:8000`; não recebe as
credenciais AWS reais do terminal.

## Operar AWS/Pulumi

Os secrets AWS e Pulumi precisam estar disponíveis no Codespace. Eles são
separados dos secrets de GitHub Actions. Não imprima seus valores nem os
copie para commits, documentos ou variáveis `VITE_`.

```sh
aws sts get-caller-identity --query '{Account:Account,Arn:Arn}' --output json
cd pulumi-start-aws
pulumi whoami
pulumi stack ls
```

A conta prevista é `672791231338`, região `us-east-1`. Use os comandos de
build, preview e publicação do [guia Pulumi](../pulumi-start-aws/README.md).
`npm run dev` não executa Pulumi nem usa DynamoDB cloud.

A stack dev possui autenticação simplificada; não armazene dados pessoais
reais nesse ambiente. Produção mantém Google OAuth e tabela separada.
Não crie zona DNS de desenvolvimento: use `pulumi stack output appUrl --stack dev` para obter a Function URL.

O consumo do Codespaces tem franquia/faturamento próprio no GitHub, separado
dos créditos AWS. Recursos AWS adicionais exigem revisão de custo antes da criação.

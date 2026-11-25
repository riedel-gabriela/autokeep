# Implementação atual

O frontend React/TypeScript consome uma API Express compartilhada entre Docker
local e Lambda. Os dados ficam em DynamoDB: DynamoDB Local no Docker e tabelas
AWS existentes `autokeep-dev` e `autokeep-prod`. Pulumi adota as tabelas e
funções existentes.

## Recursos implementados

- Garagem pessoal e espaços de frota com perfis ADMIN/DRIVER, atribuição de
  veículos e isolamento por organização.
- Leituras de quilometragem, histórico, trocas de óleo, arquivamento e auditoria.
- Alertas por distância e tempo, pré-alertas, projeção e notificações persistidas.
- Tema claro/escuro, cadastro por convite e autenticação por senha.
- Login por Google OAuth obrigatório na produção, com criação de espaço e
  vinculação de contas existentes. O modo por senha fica disponível em dev.
- Credenciais locais de demonstração preenchidas automaticamente apenas para a
  tabela DynamoDB Local; não são expostas pelas stacks AWS.
- Web Push opcional, com envio agendado restrito à stack `dev` e desligado por
  padrão.
- Hospedagem AWS: S3 privado e CloudFront para o frontend, API Gateway HTTP,
  Lambda, DynamoDB, ACM e DNS Route 53.
- CI no GitHub Actions e fluxo de desenvolvimento/teste local com AWS SAM.

## Hospedagem AWS de produção

O site publicado em `https://autokeep.negoci.online` usa CloudFront para servir
os arquivos do bucket S3 privado. `/api/*` segue para API Gateway HTTP, que
invoca `autokeep-api-prod` e usa `autokeep-prod`. O certificado ACM é validado
por DNS na zona Route 53 delegada. O Pulumi configura essa topologia.

Build e publicação são operações distintas. `npm run build` e
`npm run build:lambda` geram artefatos; `pulumi preview --diff` mostra o plano;
`pulumi up` aplica após revisão. O procedimento está em
[`../pulumi-start-aws/README.md`](../pulumi-start-aws/README.md).

## Desenvolvimento local

`npm run dev` inicia frontend/API, DynamoDB Local e Mailpit pelo Compose. Esse
caminho usa credenciais fictícias e não chama AWS. `npm run down` para os
containers e preserva o volume local. Testes de integração iniciam um DynamoDB
Local descartável e recusam endpoints cloud.

## Configurações opcionais e custos

OAuth Google requer cliente OAuth e segredo no AWS Secrets Manager, além de
permissão de leitura limitada ao ARN desse segredo. O Pulumi impede o preview de
produção se o client ID/ARN não estiverem configurados. O Web Push local usa
chaves VAPID no `.env`; o envio agendado na AWS é restrito à stack `dev`, exige
habilitação explícita e cria uma regra EventBridge. Verifique custos AWS atuais
antes de criar segredo ou habilitar push agendado.

O convite cloud oferece um link copiável; e-mail real não está configurado.
OBD2 aceita somente valor confirmado pelo usuário; leitura automática Bluetooth
e operação offline não estão implementadas. O histórico MySQL antigo não é
migrado automaticamente nem é apagado por esta refatoração.

## Evidência de validação

O repositório inclui `npm test`, `npm run test:integration`, builds e validação
SAM. Registre os comandos executados em cada revisão; a existência dos scripts
não comprova sua execução. A disponibilidade de `/api/health` não comprova
login, gravações ou isolamento ponta a ponta na AWS. A matriz de milestones
está em [`milestone-audit.md`](milestone-audit.md).

# Implementação unificada

A refatoração substitui o backend MySQL local por DynamoDB Local e mantém uma
única API Express para Docker, Vercel e Lambda. Foram removidos as migrações SQL,
o repositório SQL, autenticação/seed locais duplicados e worker MySQL.

O Docker mantém banco persistente na rede interna e usa credenciais fictícias.
A criação automática de tabela é limitada a endpoint HTTP local conhecido e
bloqueada em produção. Não cria recursos AWS.

Notificações antes vazias no backend cloud agora são persistidas, deduplicadas
e marcadas como lidas. São avaliadas sob demanda ao abrir a caixa de avisos,
sem scan global nem agendador. Isso substitui a avaliação local de 15 minutos:
sem acesso ao app não há novos avisos/emails. SMTP segue restrito ao Mailpit.

O Pulumi deixou de criar um bucket genérico e agora referencia somente tabelas
e Lambdas existentes, com stacks dev/prod. Referenciar não significa importar
recursos para gerenciamento. DNS e recursos extras não são criados.

## Validação

`npm test`: limites temporais/quilométricos, projeção, média e calibração.
`npm run test:integration`: API real com DynamoDB Local descartável, login,
isolamento de organização, RBAC, convites de uso único sequencial, persistência
e deduplicação de notificações e logout. Recusa endpoints cloud.
`npm run build`: TypeScript e SPA. `npm run build:lambda`: pacote local.

## Limites preservados

Não há migração automática dos dados MySQL antigos; seu volume não é apagado.
Não há OAuth/Cognito, push, email cloud, offline ou leitura Bluetooth OBD2.
Sem scheduler cloud, notificações não são emitidas em background.
Operações multitem não são transacionais: disputas concorrentes exigem evolução
específica. Latência abaixo de 200 ms não foi medida.

A especificação PDF e `openapi.yaml` são referências originais. O contrato atual
está em `openapi.local.yaml`; a API unificada usa os mesmos caminhos em nuvem.
Veja `aws-review.md` para recursos auditados e `milestone-audit.md` para diagnóstico
histórico das milestones antes da refatoração.

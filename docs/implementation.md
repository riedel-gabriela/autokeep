# Implementação atual

O AutoKeep oferece somente garagem pessoal. O frontend React/TypeScript chama
a API Express compartilhada pelo Docker e pela Lambda. DynamoDB Local atende
o desenvolvimento local; `autokeep-dev` e `autokeep-prod` isolam os ambientes AWS.

## Fluxo funcional

A conta possui uma garagem pessoal, veículos ativos e histórico preservado de
veículos arquivados. Cada veículo possui leituras reais de quilometragem e
registros de troca de óleo. O cálculo de manutenção usa o primeiro limite
atingido: distância do tipo de óleo ou 365 dias desde a troca. A média das
últimas leituras estima o uso, sem substituir o odômetro confirmado.

Notificações são persistidas e deduplicadas por destinatário e ciclo de
manutenção. Histórico e auditoria registram as operações críticas. A interface
mantém os temas claro e escuro.

Gestão de frota, atribuição de motoristas, convites e login por senha foram
removidos. Dados legados não são apagados por essa mudança. O contrato mantém
identificadores de organização internamente para preservar os registros.

## Autenticação

Em desenvolvimento, **Entrar** chama `POST /api/auth/dev-login` e abre uma
sessão da conta pessoal de teste. O servidor exige `NODE_ENV=development`,
`DEV_LOGIN_ENABLED=true` e modo diferente de Google; esconder o botão não é a
proteção. Em produção o login é exclusivamente Google OAuth, com validação de
state, nonce, PKCE e identidade verificada. Sessões usam cookies HttpOnly; o
banco armazena o hash do token. Requisições de escrita validam a origem.

## Execução e infraestrutura

`npm run dev` sobe aplicação e DynamoDB Local pelo Compose. `npm run down`
para os containers e preserva o volume. Os comandos de teste e build estão no
[README](../README.md); a integração usa banco descartável e recusa endpoint cloud.

O Pulumi publica frontend em S3 privado/CloudFront e API em API Gateway/Lambda.
Dev serve frontend e API pela Function URL da Lambda existente, sem CDN adicional. Prod usa `autokeep.negoci.online`, com
Route 53 e ACM. As tabelas e Lambdas existentes são adotadas. Consulte o
[guia Pulumi](../pulumi-start-aws/README.md) e revise o preview antes de aplicar.

## Pendências conhecidas

- Habilitar e validar push real em produção; push substitui e-mail no escopo acordado.
- Ativar o CD implementado em `.github/workflows/ci.yml` e registrar execução real;
  veja [continuous-deployment.md](continuous-deployment.md).
- Evidência em dispositivo real para entrega Web Push, responsividade e latência.
- GPS, Bluetooth/OBD2 automático e operação offline são evoluções de produto.

A existência de testes ou configuração não comprova um deploy. Registre os
resultados efetivamente executados em cada revisão. O inventário acadêmico está
em [milestone-audit.md](milestone-audit.md).

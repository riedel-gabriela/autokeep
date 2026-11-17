# Auditoria das milestones — 17/11/2026

> Diagnóstico histórico anterior à refatoração. Consulte `aws-review.md` para
> recursos confirmados no console e `implementation.md` para o estado desta branch.

Fonte: https://github.com/users/ederson-torresini/projects/6 e issues de
https://github.com/ederson-torresini/isn20262.

Revisão estática do checkout. Não foram executados build, testes ou aplicação.
Não foi possível acessar o navegador: integração indisponível e acesso nativo
ao Chrome expirou. Recursos publicados na AWS/Vercel não foram confirmados.
O estado fechado das issues da disciplina não comprova conclusão neste projeto.

| Sprint / prazo | Requisitos | Evidência e situação neste repositório |
| --- | --- | --- |
| 1 / 17/09 | #18–23: resumo, requisitos, regras, casos de uso, diagramas e fluxogramas | Parcialmente evidenciado: README, docs/implementation.md, docs/architecture.md, contratos OpenAPI, PDF de especificação e imagens. PDF e imagens não foram inspecionados nesta revisão; confirmar cobertura explícita de casos de uso e fluxogramas. |
| 2 / 01/10 | #24–28: ambiente IaC, Pulumi dev/prod, domínio por IaC e registros DNS | Parcial inicial: pacote Pulumi presente, mas index.ts cria somente um bucket S3 genérico. Não há definições de domínio/DNS nem configurações versionadas das duas stacks. Existência de stacks remotas não verificada. |
| 3 / 22/10 | #29–32: ambiente local SAM, funções desenvolvidas/publicadas, banco em nuvem | Parcial: API local em Docker/MySQL, API cloud com DynamoDB e adaptador Lambda. Não há template SAM. README informa tabela publicada, mas Lambda ainda não criada. Docker não atende sozinho ao requisito explícito de ambiente SAM. |
| 4 / 05/11 | #34–37 e #46: CDN, API Gateway, certificado HTTPS e integração Lambda | Sem implementação AWS reproduzível encontrada. Arquitetura documenta CloudFront/API Gateway/Cognito, mas Pulumi não os provisiona. Vercel é o destino descrito no README; confirmar com docente se hospedagem/CDN/HTTPS externos atendem a esses itens. |
| 5 / 19/11 | #38–41: frontend, hospedagem, autenticação/base de usuários, autenticação e email | Frontend React implementado; Vercel configurada, publicação não verificada. Login bcrypt e sessões em MySQL/DynamoDB implementados. Convites por email via Mailpit apenas local; cloud devolve link. Não há integração de email real ou fluxo de verificação/recuperação de senha encontrado. A issue #41 não detalha o critério esperado. |
| 6 / 03/12 | #42–45: testes unitários, integração, CI e CD | Não encontrados arquivos de testes, scripts de testes ou workflows em .github. vercel.json configura hospedagem/build, mas não comprova pipeline automatizado ou execução. |

## Funcionalidades já presentes no código

- Interface responsiva para garagem pessoal, frotas e motorista.
- Organizações, vínculos, perfis ADMIN/DRIVER e autorização por recurso.
- Veículos, atribuição de motorista, arquivamento, leituras e trocas de óleo.
- Histórico e auditoria.
- Convites com token e expiração; aceitação e cadastro por convite.
- Regras de manutenção por tempo/km, pré-alertas, média e projeção.
- Ambiente local Docker com MySQL, migrações, seed e Mailpit.
- Implementação alternativa DynamoDB e entrada para empacotamento Lambda.

Presença no código não equivale a validação funcional ou de segurança.

## Gaps funcionais e divergências documentais

- src/server/cloud-app.ts: notificações retornam sempre `[]`; marcar como lidas
  devolve sucesso sem persistir. Não é uma implementação completa de notificações.
- src/server/worker.ts depende de MySQL e SMTP local. O agendamento de 15 minutos
  está em src/server/server.ts; não há worker DynamoDB/EventBridge equivalente.
- Envio real de convites/alertas, push remoto e leitura automática de hardware
  OBD2 não implementados. OBD2 atual é registro de valor confirmado manualmente.
- docs/architecture.md descreve JWT Cognito, CloudFront, API Gateway, índices
  DynamoDB e SNS como arquitetura existente; README e código mostram outro estado.
  Atualizar para diferenciar arquitetura atual da proposta.
- Manifest existe; operação offline não implementada. docs/sw.js isolado não
  comprova registro do service worker nem entrega Web Push.
- Meta de latência inferior a 200 ms não possui medição apresentada.

Esses gaps do produto não são automaticamente exigências da disciplina:
o escopo obrigatório deve seguir as issues e a especificação aprovada.

## Ordem sugerida de conclusão

1. Confirmar quais recursos já existem na conta e registrar evidências sem
   duplicar provisionamento. Conferir também publicação Vercel.
2. Substituir template Pulumi pela infraestrutura real, com dev/prod, domínio
   e DNS; preparar SAM para Lambda e banco local conforme #29.
3. Publicar API Lambda, integrar API Gateway e concluir CDN/HTTPS conforme
   critérios da disciplina; validar login e persistência ponta a ponta.
4. Concluir o requisito de email da Sprint 5 e documentar seu fluxo demonstrável.
5. Criar testes das regras de manutenção, autorização, convites e isolamento
   entre organizações; adicionar testes de integração e CI/CD.
6. Atualizar documentação e reunir evidências de cada entrega.

Não foram alterados código, infraestrutura, recursos AWS ou estado do GitHub.

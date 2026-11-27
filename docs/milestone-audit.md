# Requisitos da disciplina e evidências

Referência principal: [requisitos oficiais do professor](https://github.com/ederson-torresini/isn20262/blob/main/requisitos.md).
O [quadro de milestones](https://github.com/users/ederson-torresini/projects/6)
pode conter critérios adicionais por entrega. Conforme ajuste de escopo informado pelo responsável do projeto, notificações
push substituem o envio de e-mail. Esta matriz distingue código
existente, validação executada e pendência; não declara a disciplina concluída.

| Requisito                                                           | Situação e evidência                                                                                                                                                                                                                |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aplicação web cliente-servidor; frontend sob demanda; backend cloud | Implementado: React, Express/Lambda, S3/CloudFront e API Gateway.                                                                                                                                                                   |
| REST documentado                                                    | Contrato atual em `openapi.local.yaml`; conferir contrato e testes quando endpoints mudarem.                                                                                                                                        |
| Autenticação e autorização por provedor externo                     | Google OAuth em produção; cada conta acessa somente sua garagem. Login Google e garagem pessoal validados após a refatoração; detalhes em codespaces-validation.md.                                                                 |
| Persistência e modelagem de dados                                   | DynamoDB Local e tabelas cloud separadas; arquitetura documentada. Modelagem atual em data-model.md, com chaves DynamoDB e regras de manutenção.                                                                                    |
| Notificações push                                                   | Notificações no app implementadas; push substitui e-mail no escopo acordado. Web Push tem testes simulados; habilitação em produção e entrega em aparelho real ainda precisam ser comprovadas.                                      |
| Auditoria de operações críticas                                     | Implementada em login/logout, veículos, leituras e manutenção; histórico preservado no arquivamento.                                                                                                                                |
| Cenários dev/prod e implantação cloud via IaC                       | Stacks dev/prod aplicadas; fluxos pessoais validados e previews sem alterações (7 recursos dev, 42 prod).                                                                                                                           |
| DNS, HTTPS e CDN                                                    | Produção publicada em `autokeep.negoci.online`, com zona delegada, ACM e CloudFront geridos por Pulumi. Dev usa a Function URL da Lambda existente.                                                                                 |
| Implantação automática prod com CI/CD                               | Workflow em `.github/workflows/ci.yml`: valida, publica dev, testa e promove o mesmo pacote a prod em pushes na main. Ativação depende de secrets de Actions e da integração da branch; execução real ainda precisa ser registrada. |
| Ambiente local e SAM                                                | Compose com DynamoDB Local; `template.yaml`, scripts `sam:*` e `sam/environment.json` existem. Registrar execução SAM e critérios específicos da milestone.                                                                         |
| Testes                                                              | `npm test`, integração com banco descartável e builds disponíveis. 12 testes, integração local/Codespaces, builds e fluxos pessoais AWS dev/prod aprovados após o refactor; ver registro de validação.                              |
| Responsividade, latência e custo mínimo                             | Exigem evidências: testes em celular, medições e revisão de Billing. A existência de CDN ou créditos não comprova metas.                                                                                                            |

Gestão de frota e perfis de gestor/motorista não aparecem no documento geral
como requisitos. Sua remoção preserva autenticação, autorização por dono,
manutenção, persistência, notificações e auditoria.

## Pendências para a entrega

1. Habilitar e comprovar entrega real de push em produção, com revisão de custo se necessário.
2. Ativar e registrar uma execução bem-sucedida do CD: secrets de Actions e merge na main.
3. Executar e registrar SAM, responsividade em aparelhos reais e medições de latência.
4. Conferir os critérios detalhados do quadro do professor contra as evidências atuais.

GPS, Bluetooth/OBD2 automático e offline são evoluções de produto, não
exigências identificadas no documento geral. O estudo GPS está em
[gps-study.md](gps-study.md).

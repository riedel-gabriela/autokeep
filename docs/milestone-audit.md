# Requisitos da disciplina e evidências

Referência principal: [requisitos oficiais do professor](https://github.com/ederson-torresini/isn20262/blob/main/requisitos.md).
O [quadro de milestones](https://github.com/users/ederson-torresini/projects/6)
pode conter critérios adicionais por entrega. Esta matriz distingue código
existente, validação executada e pendência; não declara a disciplina concluída.

| Requisito                                                           | Situação e evidência                                                                                                                                                                       |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Aplicação web cliente-servidor; frontend sob demanda; backend cloud | Implementado: React, Express/Lambda, S3/CloudFront e API Gateway.                                                                                                                          |
| REST documentado                                                    | Contrato atual em `openapi.local.yaml`; conferir contrato e testes quando endpoints mudarem.                                                                                               |
| Autenticação e autorização por provedor externo                     | Google OAuth em produção; cada conta acessa somente sua garagem. Login real em produção já foi validado antes da refatoração e deve ser repetido após o deploy.                            |
| Persistência e modelagem de dados                                   | DynamoDB Local e tabelas cloud separadas; arquitetura documentada. Diagramas e especificação antigos precisam ser conferidos para a entrega da garagem pessoal.                            |
| E-mail e notificações                                               | Notificações no app implementadas; envio real de e-mail continua pendente e é obrigatório no documento do professor. Web Push tem testes simulados, sem comprovação de entrega em celular. |
| Auditoria de operações críticas                                     | Implementada em login/logout, veículos, leituras e manutenção; histórico preservado no arquivamento.                                                                                       |
| Cenários dev/prod e implantação cloud via IaC                       | Configuração Pulumi existe para ambos. Publicação funcional de dev e regressão de prod devem ter evidência da aplicação desta refatoração.                                                 |
| DNS, HTTPS e CDN                                                    | Produção publicada em `autokeep.negoci.online`, com zona delegada, ACM e CloudFront geridos por Pulumi. Dev usa a Function URL da Lambda existente.                                        |
| Implantação automática prod com CI/CD                               | CI existente em `.github/workflows/ci.yml` testa e gera builds. CD de produção ainda pendente; publicação manual pelo Pulumi não cumpre implantação automática.                            |
| Ambiente local e SAM                                                | Compose com DynamoDB Local; `template.yaml`, scripts `sam:*` e `sam/environment.json` existem. Registrar execução SAM e critérios específicos da milestone.                                |
| Testes                                                              | `npm test`, integração com banco descartável e builds disponíveis. Testes locais e fluxos pessoais em produção foram executados antes do refactor; repetir após a alteração.               |
| Responsividade, latência e custo mínimo                             | Exigem evidências: testes em celular, medições e revisão de Billing. A existência de CDN ou créditos não comprova metas.                                                                   |

Gestão de frota e perfis de gestor/motorista não aparecem no documento geral
como requisitos. Sua remoção preserva autenticação, autorização por dono,
manutenção, persistência, notificações e auditoria.

## Pendências para a entrega

1. Implementar e validar e-mail real com recurso/custo previamente autorizado.
2. Configurar deploy automático de produção via CI/CD, com credenciais de escopo mínimo.
3. Registrar resultados de dev/prod, SAM, responsividade e latência.
4. Conferir diagramas, especificação e critérios detalhados do quadro do professor.

GPS, Bluetooth/OBD2 automático e offline são evoluções de produto, não
exigências identificadas no documento geral. O estudo GPS está em
[gps-study.md](gps-study.md).

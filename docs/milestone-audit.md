# Objetivos da disciplina e estado do AutoKeep

Resumo dos requisitos descritos no [quadro de milestones do professor](https://github.com/users/ederson-torresini/projects/6)
e nas [issues da disciplina](https://github.com/ederson-torresini/isn20262),
comparados às evidências deste repositório e da implantação AWS confirmada em
18/11/2026.
“Implementado” indica evidência no código/configuração; só “validado” indica
que o fluxo foi executado com sucesso. Confirmar no quadro do professor se os
critérios detalhados diferirem deste resumo.

| Entrega | Estado | Evidência / o que falta demonstrar |
| --- | --- | --- |
| Requisitos, regras, casos de uso e documentação | Parcial | Há README, contratos OpenAPI e documentos de arquitetura/implementação. Conferir se diagramas, fluxos e especificação exigidos estão completos e coerentes com a solução atual. |
| IaC com Pulumi e ambientes dev/prod | Implementado; operação validada em prod | `pulumi-start-aws/` tem configuração de ambas as stacks. A stack `prod` adotou recursos existentes e concluiu update #10; antes de reaplicar, use os comandos do guia Pulumi e revise o preview. |
| DNS e domínio por IaC | Implementado e acessível | Hosted zone `autokeep.negoci.online` existente/delegada; registros A/AAAA e certificado ACM são geridos pela stack. O site abre em `https://autokeep.negoci.online`. |
| Ambiente local para API, funções e banco | Parcial | Docker Compose sobe app, DynamoDB Local e Mailpit. O projeto não inclui template AWS SAM; se a issue exige SAM especificamente, esse item continua pendente. |
| Banco cloud e Lambda publicada | Implementado; teste de negócio pendente | `autokeep-prod` e `autokeep-api-prod` existentes/adotados. O Pulumi integra API Gateway HTTP à Lambda. Falta demonstrar login, escrita/leitura e isolamento de ponta a ponta na AWS. |
| CDN, API Gateway, HTTPS e integração Lambda | Implementado; saúde pública a verificar | S3 privado, CloudFront, API Gateway, ACM e Lambda fazem parte do deploy. A página inicial foi aberta no domínio; executar também `curl -i https://autokeep.negoci.online/api/health` e os testes de fluxo. |
| Frontend e autenticação | Implementado | Frontend React e autenticação com sessão estão no código e no site. Testar os perfis, autorização por organização e persistência no endpoint publicado. |
| Email/convites | Parcial | Mailpit recebe emails somente no ambiente local. Na nuvem, o app fornece link copiável; envio real de email e recuperação/verificação por email não estão configurados. |
| Testes unitários e de integração | Implementado no repositório; execução recente pendente | Existem `npm test` e `npm run test:integration`. Executar e registrar evidência antes da entrega; integração usa DynamoDB Local descartável. |
| CI/CD | Pendente | Não há workflow automatizado em `.github/workflows`. O deploy atual é feito explicitamente pelo Pulumi no Codespace. |

## Limites funcionais conhecidos

- Não há notificações em background nem scheduler cloud; os avisos são
  avaliados quando o usuário abre a caixa de notificações.
- Não há envio remoto de email, push, operação offline ou leitura automática
  de OBD2. O valor OBD2 é informado/confirmado pelo usuário.
- A hospedagem e o fluxo principal existem, mas isso não substitui evidência de
  testes de autorização, concorrência, carga ou metas de latência.
- `pulumi destroy` não é um comando de desligamento seguro: recursos estão
  protegidos contra exclusão e alguns têm retenção. Ver
  [`pulumi-start-aws/README.md`](../pulumi-start-aws/README.md).

## Próxima sequência de validação

1. Executar testes unitários, integração local e builds pelo README.
2. Na URL pública, validar `/api/health`, login, leitura/gravação e isolamento
   com mais de um perfil/organização.
3. Confirmar com o professor se SAM e envio real de email são critérios
   obrigatórios para as issues correspondentes; implementar apenas se exigidos.
4. Adicionar CI/CD e salvar evidências de cada milestone, caso o rubric exija.

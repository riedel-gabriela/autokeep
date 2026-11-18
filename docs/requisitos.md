# Especificação atual do AutoKeep

Revisão da sprint 1 em 16/11/2026, baseada no código `ac69017`. Esta revisão descreve evidências no repositório; não certifica testes ou implantação nas contas externas.

## Resumo e objetivo

Aplicação web em português para acompanhar quilometragem e manutenção por tempo e distância de veículos pessoais ou de frotas. O sistema permite registrar leituras e trocas de óleo, distribuir veículos entre motoristas e consultar histórico e alertas.

## Escopo e fontes

O PDF [technical-specification.pdf](technical-specification.pdf) permanece como referência original, sem alterações nesta revisão. Este documento é a especificação de acompanhamento da implementação atual, derivada do código e de [implementation.md](implementation.md). Mudanças de escopo em relação à proposta original precisam de aceite do responsável pela disciplina.

Fontes de implementação: `src/shared/domain.ts`, `src/server/validation.ts`, `src/server/app.ts`, `src/server/cloud-app.ts`, `src/server/auth.ts`, `src/server/worker.ts` e `db/001_initial.sql`.

## Atores e permissões

Os papéis são definidos por organização: uma pessoa pode ter associações em espaços diferentes. Garagem pessoal (`PERSONAL`) e frota (`FLEET`) são tipos de espaço, não papéis globais.

| Ação | ADMIN | DRIVER |
| --- | --- | --- |
| Consultar painel, detalhes e histórico | Todos os veículos ativos do espaço | Apenas veículos atribuídos |
| Registrar leitura | Veículos do espaço | Apenas veículos atribuídos |
| Cadastrar/arquivar veículo e registrar troca de óleo | Permitido | Negado |
| Consultar membros e auditoria | Permitido | Negado |
| Convidar e atribuir motoristas | Permitido em FLEET | Negado |
| Remover motorista | Permitido se não houver veículos ativos atribuídos | Negado |

## Requisitos funcionais e rastreabilidade

“Implementado” significa presente no código. A validação em execução permanece uma etapa separada.

| ID | Requisito e resultado esperado | Local MySQL | Nuvem DynamoDB | Fonte / caso de uso |
| --- | --- | --- | --- | --- |
| RF-01 | Autenticar por e-mail/senha e encerrar sessão | Implementado | Implementado | `auth.ts`, `cloud-app.ts`; UC-01 |
| RF-02 | Listar/criar espaços e selecionar a organização ativa | Implementado | Implementado | APIs e `src/web/App.tsx`; UC-02 |
| RF-03 | Cadastrar veículo com dados e manutenção inicial coerentes | Implementado | Implementado | `validation.ts`, APIs; UC-03 |
| RF-04 | Registrar leitura real sem regressão ou data futura | Implementado | Implementado | APIs; UC-04 |
| RF-05 | Registrar troca e iniciar novo ciclo de manutenção | Implementado | Implementado | APIs; UC-05 |
| RF-06 | Calcular média, projeção e estado de manutenção | Implementado | Implementado | `domain.ts`; UC-06 |
| RF-07 | Consultar detalhes, leituras e trocas anteriores | Implementado | Implementado | APIs; UC-06 |
| RF-08 | Convidar motorista e aceitar convite com conta nova ou existente | Implementado; e-mail Mailpit | Link para copiar; sem e-mail real | APIs; UC-07 |
| RF-09 | Atribuir/desatribuir veículo sem apagar histórico | Implementado | Implementado | APIs; UC-08 |
| RF-10 | Remover associação de motorista sem atribuições ativas | Implementado | Implementado | APIs; UC-09 |
| RF-11 | Arquivar veículo preservando histórico | Implementado | Implementado | APIs; UC-09 |
| RF-12 | Consultar atividades administrativas auditadas | Implementado | Implementado parcialmente; eventos diferem | APIs; UC-10 |
| RF-13 | Gerar avisos periódicos de manutenção/calibração e marcar leitura | Implementado no worker local | Rotas provisórias; lista vazia e confirmação sem persistência | `worker.ts`, `cloud-app.ts`; UC-11 |
| RF-14 | Obter quilometragem por conexão real com OBD2 | Pendente; registro de valor confirmado disponível | Pendente | `implementation.md`; fora do fluxo automatizado atual |
| RF-15 | Entregar notificações push remotas | Pendente | Pendente | `implementation.md` |
| RF-16 | Autenticar com provedor externo/OAuth | Substituído nesta etapa por senha e sessão | Mesmo modelo de sessão | Mudança de escopo a confirmar |

## Regras de negócio

| ID | Regra | Evidência |
| --- | --- | --- |
| RN-01 | Uma operação exige associação à organização e autorização sobre o recurso. DRIVER só acessa veículos atribuídos. | APIs e `repository.ts` |
| RN-02 | Limites de óleo: MINERAL 5.000 km, SEMI_SYNTHETIC 8.000 km, SYNTHETIC 12.000 km; limite temporal de 365 dias. | `domain.ts` |
| RN-03 | Estado DUE se distância restante ou dias restantes forem menores ou iguais a zero. WARNING se restarem até 500 km ou até 30 dias, sem vencimento. | `enrichVehicle` |
| RN-04 | A distância restante usa o odômetro previsto; a interface distingue projeção e leitura real. A projeção não sobrescreve as leituras. | `domain.ts`, interface |
| RN-05 | A média usa as três últimas leituras reais: diferença de km entre a primeira e a última dividida pelo intervalo em dias. Com menos de duas leituras ou intervalo inferior a um dia, a média é zero. | `dailyAverage` |
| RN-06 | O odômetro previsto é o último real mais a média diária multiplicada pelos dias decorridos, sem intervalo negativo. | `enrichVehicle` |
| RN-07 | Calibração pendente no modo MANUAL quando há menos de três leituras e pelo menos 30 dias desde a última atualização. Não é um prazo fixo contado do cadastro. | `enrichVehicle` |
| RN-08 | Leituras rejeitam futuro, redução de odômetro e inversão cronológica. Trocas devem ser coerentes com leituras e manutenção anterior. | Validações e APIs |
| RN-09 | O cadastro exige quilometragem da última troca menor ou igual à atual, placa brasileira normalizada e ano entre 1950 e ano corrente mais um. | `createVehicleSchema` |
| RN-10 | Convite expira em sete dias, fica vinculado ao e-mail e deve ser aceito uma vez. O cadastro por convite cria associação DRIVER. | APIs |
| RN-11 | O token do convite é entregue no fragmento `#invite=`; o cliente o envia no corpo JSON. Apenas seu hash é utilizado na chave/registro persistido. | APIs |
| RN-12 | Troca de motorista preserva histórico e ciclo do óleo. Arquivamento retira veículo das consultas ativas. | APIs |
| RN-13 | O worker local deduplica avisos por destinatário e evento de ciclo/nível/calibração; tenta novamente e-mails ainda não confirmados. | `worker.ts` |

Garantias de concorrência não são equivalentes entre backends: o caminho MySQL usa transações e bloqueio no aceite de convite; o caminho DynamoDB usa múltiplas operações separadas. A intenção de uso único não comprova atomicidade do aceite na nuvem. Isso precisa de teste e eventual correção nas próximas sprints.

## Requisitos não funcionais

| ID | Requisito/meta | Situação e forma de comprovar |
| --- | --- | --- |
| RNF-01 | Interface responsiva em português | Implementação presente; validar telas e tamanhos no navegador |
| RNF-02 | Senhas com bcrypt, cookies HttpOnly/SameSite Strict e expiração de sessão em 12 horas | Presente no código; Secure depende do ambiente/origem; testar login, expiração e logout |
| RNF-03 | Escritas exigem origem esperada e JSON; validação de entrada e isolamento por organização | Presente; testar tentativas de acesso indevido; não presumir que isso substitui todos os controles de segurança |
| RNF-04 | Persistência local reproduzível e datas de negócio em UTC | Compose, migrações e volume presentes; validar reinício e persistência |
| RNF-05 | Resposta abaixo de 200 ms | Meta registrada na documentação anterior; sem medição, carga, percentil ou endpoints definidos. Confirmar método antes de declarar atendimento |
| RNF-06 | Ambientes dev/prod gerenciados por IaC | Pendente: arquivos de região não comprovam stacks ou isolamento |
| RNF-07 | Testes automatizados e CI/CD reproduzíveis | Pendente na versão analisada |
| RNF-08 | HTTPS e observabilidade da entrega AWS | Planejados; validar domínio, certificado, logs e saúde após implantação |

## Mudanças e decisões de escopo

- A proposta histórica com Cognito/JWT não descreve a autenticação atual: ambos os backends usam sessão em cookie.
- O backend local usa MySQL; a API de nuvem usa DynamoDB com chaves `pk`/`sk`, sem os GSIs da arquitetura antiga.
- Vercel é a publicação documentada; Lambda tem adaptador e build, mas publicação e integração ainda pendentes.
- E-mail real, worker na nuvem, push, hardware OBD2 e OAuth não devem ser apresentados como entregues.
- Não há cadastro público irrestrito implementado: a criação de conta pela API ocorre por convite; perfis de demonstração vêm do seed.

## Documentos relacionados

- [Arquitetura e blocos](architecture.md)
- [Casos de uso](casos-de-uso.md)
- [Fluxogramas](fluxogramas.md)
- [Contrato atual](openapi.yaml) e [diferenças dos backends](contratos-api.md)
- [Backlog das sprints](pendencias-sprints.md)

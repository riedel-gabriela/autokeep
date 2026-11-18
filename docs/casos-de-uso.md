# Casos de uso — AutoKeep

Revisão da sprint 1 em 16/11/2026. Derivados da implementação `ac69017`; cenários abaixo são critérios de revisão manual e futuros testes, não resultados de testes executados.

Prefixo HTTP comum: `/api`. Papéis ADMIN/DRIVER são por organização. A garagem pessoal usa ADMIN e não oferece convites/atribuições de frota.

| ID | Caso de uso | Ator | Requisitos |
| --- | --- | --- | --- |
| UC-01 | Entrar, restaurar e encerrar sessão | Pessoa com conta | RF-01 |
| UC-02 | Criar e selecionar espaço | Pessoa autenticada | RF-02 |
| UC-03 | Cadastrar veículo | ADMIN | RF-03 |
| UC-04 | Atualizar quilometragem | ADMIN ou DRIVER atribuído | RF-04 |
| UC-05 | Registrar troca de óleo | ADMIN | RF-05 |
| UC-06 | Consultar manutenção e histórico | ADMIN ou DRIVER atribuído | RF-06, RF-07 |
| UC-07 | Convidar e integrar motorista | ADMIN de FLEET e convidado | RF-08 |
| UC-08 | Atribuir ou desatribuir motorista | ADMIN de FLEET | RF-09 |
| UC-09 | Remover motorista ou arquivar veículo | ADMIN | RF-10, RF-11 |
| UC-10 | Consultar auditoria | ADMIN | RF-12 |
| UC-11 | Receber e ler avisos locais | Worker e destinatário associado | RF-13 |

## UC-01 — Sessão

**Pré-condição:** conta existente no banco selecionado. Escritas enviam `Origin` igual à origem configurada e JSON.

1. Pessoa informa e-mail e senha; interface chama `POST /auth/login`.
2. API valida entrada, limite de tentativas e hash da senha.
3. API persiste hash do token e expiração, envia cookie `autokeep_session` e retorna usuário e associações.
4. Em novo carregamento, `GET /session` recupera a identidade.
5. `POST /auth/logout` remove a sessão e limpa o cookie.

**Exceções:** credenciais inválidas retornam 401; sessão inválida/expirada impede acesso; limite de tentativas retorna 429. O formato do erro de limite não é uniforme entre backends.

**Resultado:** sessão válida por até 12 horas ou revogada. OAuth e recuperação de senha não fazem parte deste fluxo implementado.

## UC-02 — Espaço pessoal ou frota

**Pré-condição:** sessão válida.

1. Consultar `GET /me/organizations` e selecionar espaço na interface.
2. Para criar, enviar nome e tipo PERSONAL/FLEET a `POST /organizations`.
3. API cria organização e associação ADMIN do criador.

**Exceção:** outra organização não se torna acessível por alteração de URL; associação deve ser verificada pela API.

**Resultado:** espaço disponível na lista do usuário. Uma pessoa pode pertencer a vários espaços.

## UC-03 — Cadastro de veículo

**Pré-condição:** associação ADMIN no espaço.

1. Informar nome, placa, ano, tipo de óleo, modo de leitura, odômetro atual e última troca.
2. Enviar `POST /organizations/{organizationId}/vehicles`.
3. API valida campos e coerência; persiste veículo, leitura inicial e manutenção informada.
4. Painel consulta os dados enriquecidos com estado de manutenção.

**Exceções:** DRIVER não cadastra; data futura, placa inválida ou km da troca acima da atual são rejeitados.

**Resultado:** veículo ativo com histórico inicial. Persistência multirregistro é transacional no MySQL; não pressupor a mesma atomicidade no DynamoDB.

## UC-04 — Leitura de quilometragem

**Pré-condição:** veículo ativo visível ao ator.

1. Informar odômetro real, data e origem MANUAL/OBD2.
2. Enviar `POST /organizations/{organizationId}/vehicles/{vehicleId}/odometer`.
3. API rejeita futuro, regressão ou ordem cronológica inválida; grava leitura e atualização do veículo.
4. Nova consulta recalcula média, previsão e estado de manutenção.

**Exceção:** DRIVER sem atribuição não acessa o veículo. Origem OBD2 indica valor informado/confirmado; não comprova conexão com hardware.

**Resultado:** histórico preservado; projeções nunca substituem leituras reais.

## UC-05 — Troca de óleo

**Pré-condição:** ADMIN e veículo ativo do espaço.

1. Informar km, data da troca e tipo de óleo.
2. Enviar `POST /organizations/{organizationId}/vehicles/{vehicleId}/oil-changes`.
3. API verifica coerência com leituras e manutenção anterior, registra troca e atualiza o ciclo.

**Exceções:** DRIVER, data futura e valores incoerentes são rejeitados.

**Resultado:** próxima consulta usa a nova âncora de manutenção, mantendo o histórico anterior.

## UC-06 — Consulta de manutenção

**Pré-condição:** sessão, associação e visibilidade do veículo.

1. Consultar `GET /organizations/{organizationId}/dashboard`.
2. Abrir detalhes em `GET /organizations/{organizationId}/vehicles/{vehicleId}`.
3. Consultar `/history` para leituras e trocas (até 100 de cada).

**Resultado:** ADMIN vê veículos ativos do espaço; DRIVER apenas atribuídos. A interface distingue odômetro real, projeção e situação OK/WARNING/DUE. A previsão não garante uma medição física.

## UC-07 — Convite e adesão

**Pré-condição:** ADMIN de FLEET; destinatário ainda não é membro.

1. ADMIN chama `POST /organizations/{organizationId}/invitations` com o e-mail.
2. API gera token, persiste hash/expiração de sete dias e devolve link com fragmento `#invite=`.
3. Localmente, tenta enviar pelo Mailpit; na nuvem atual, o link deve ser copiado, sem envio de e-mail.
4. Com conta existente, destinatário entra e chama `POST /invitations/accept`.
5. Sem conta, envia token, nome e senha a `POST /auth/register-invited`; a conta usa o e-mail do convite. Depois precisa efetuar login.

**Exceções:** expirado/aceito/inválido é rejeitado; conta existente deve entrar; aceite autenticado exige mesmo e-mail.

**Resultado:** associação DRIVER e convite marcado como aceito. A garantia de uso único sob concorrência precisa de validação específica no DynamoDB, cujo fluxo usa escritas separadas.

## UC-08 — Atribuição de motorista

**Pré-condição:** ADMIN de FLEET; veículo ativo; alvo é DRIVER da mesma organização.

1. Enviar `PUT /organizations/{organizationId}/vehicles/{vehicleId}/driver` com `driverId` ou `null`.
2. API valida organização/papel, altera atribuição e registra auditoria.

**Resultado:** acesso acompanha a nova atribuição; leituras, calibração e ciclo do óleo permanecem.

## UC-09 — Remoção e arquivamento

**Pré-condição:** ADMIN.

- Para remover motorista, chamar `DELETE /organizations/{organizationId}/members/{memberId}`. A API bloqueia remoção de ADMIN e retorna 409 se houver veículos ativos atribuídos. A remoção afeta a associação, não apaga a conta global.
- Para arquivar veículo, chamar `DELETE /organizations/{organizationId}/vehicles/{vehicleId}`. O veículo sai da lista ativa, perde atribuição e mantém os registros históricos.

**Resultado:** resposta 204 na conclusão. Mesmo DELETE exige cabeçalhos de escrita definidos no contrato.

## UC-10 — Auditoria

**Pré-condição:** ADMIN associado.

Consultar `GET /organizations/{organizationId}/audit` para até 100 atividades recentes. DRIVER não consulta. MySQL registra também eventos de sessão e aceite; o backend DynamoDB não possui cobertura idêntica. Não apresentar a auditoria atual como trilha completa de todas as operações.

## UC-11 — Avisos locais

**Pré-condição:** aplicação Docker em execução, dados persistidos, destinatário associado e veículo visível.

1. Worker inicia uma avaliação e agenda a próxima para 15 minutos após terminar.
2. Calcula manutenção/calibração e ignora veículo sem necessidade de aviso.
3. Persiste aviso deduplicado por destinatário/evento e tenta entrega no Mailpit.
4. Falha no SMTP mantém envio pendente para nova tentativa.
5. Interface consulta `/organizations/{organizationId}/notifications` e marca leitura em `/notifications/read`.

**Limite:** na API DynamoDB, consulta retorna lista vazia e marcação retorna confirmação sem persistência. Worker remoto, e-mail real e push continuam pendentes.

## Evidências para avaliação

Cada caso pode gerar uma demonstração com entrada, resposta esperada e estado persistido. Nenhum resultado deve ser marcado como validado apenas por esta documentação. Os testes executáveis pertencem ao trabalho das próximas sprints.

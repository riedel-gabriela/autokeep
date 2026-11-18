# Contratos HTTP do AutoKeep

Revisão da sprint 1 em 16/11/2026, baseada nas rotas de `src/server/app.ts` e `src/server/cloud-app.ts`.

## Qual arquivo consultar

- [openapi.yaml](openapi.yaml): contrato atual das rotas comuns, com observações por backend.
- [openapi.local.yaml](openapi.local.yaml): detalhamento do comportamento MySQL local.
- [openapi.legacy.yaml](openapi.legacy.yaml): contrato histórico Cognito/JWT, preservado para rastreabilidade; não representa autenticação ou payloads atuais.

O servidor local usa `http://localhost:8080/api`. A publicação usa `/api` no mesmo domínio da interface. Os caminhos OpenAPI são relativos a esse prefixo.

## Autenticação e escritas

Login em `POST /auth/login` emite cookie `autokeep_session`. `GET /session` restaura a identidade e `POST /auth/logout` revoga a sessão. O backend atual não autentica Bearer JWT do Cognito.

Escritas exigem `Origin` igual à origem de `APP_ORIGIN` e `Content-Type: application/json`, inclusive DELETE. Operações administrativas exigem ADMIN; DRIVER acessa somente veículos atribuídos. Cadastro por convite não cria sessão automaticamente.

Erros de negócio/validação usam `code`, `message` e, quando disponível, `errorId`. O middleware de limite de tentativas pode retornar formato diferente; não assumir JSON uniforme para toda resposta 429. A senha local limita 72 bytes UTF-8, enquanto o backend de nuvem valida até 72 caracteres; essa diferença precisa de teste/correção.

## Diferenças observáveis

| Área | MySQL local | DynamoDB na nuvem |
| --- | --- | --- |
| Saúde | SELECT 1 | Leitura no banco; pode inicializar seed quando habilitado |
| Convites | Link e tentativa SMTP no Mailpit | Link sem envio real |
| Notificações GET | Lista persistida e filtrada por visibilidade | `{ "notifications": [] }` |
| Notificações/read POST | Persiste leitura | `{ "ok": true }` sem persistência |
| Avaliador | Processo local periódico | Ausente na publicação |
| Auditoria | Sessão, aceite e eventos de negócio | Cobertura diferente; sem os mesmos eventos de sessão/aceite |
| Erros inesperados | Handler local | 503 de indisponibilidade |
| Gravações compostas | Transações | Operações separadas; atomicidade equivalente não garantida |

Esta tabela faz parte da documentação do contrato: a existência de uma rota não significa funcionalidade equivalente nos dois ambientes.

## Inventário das operações comuns

Todos os caminhos abaixo são posteriores a `/api`.

| Método | Caminho | Acesso / finalidade |
| --- | --- | --- |
| GET | `/health` | Público; verifica banco |
| POST | `/auth/login` | Público; limite de tentativas |
| POST | `/auth/register-invited` | Público; convite válido |
| GET | `/session` | Sessão válida |
| POST | `/auth/logout` | Sessão válida |
| GET | `/me/organizations` | Espaços do usuário |
| POST | `/organizations` | Cria espaço e associação ADMIN |
| POST | `/invitations/accept` | Sessão com e-mail do convite |
| GET | `/organizations/{organizationId}/dashboard` | Veículos visíveis |
| POST | `/organizations/{organizationId}/vehicles` | ADMIN |
| GET | `/organizations/{organizationId}/vehicles/{vehicleId}` | Veículo visível |
| DELETE | `/organizations/{organizationId}/vehicles/{vehicleId}` | ADMIN; arquivamento |
| POST | `/organizations/{organizationId}/vehicles/{vehicleId}/odometer` | ADMIN ou DRIVER atribuído |
| POST | `/organizations/{organizationId}/vehicles/{vehicleId}/oil-changes` | ADMIN |
| PUT | `/organizations/{organizationId}/vehicles/{vehicleId}/driver` | ADMIN de FLEET |
| GET | `/organizations/{organizationId}/vehicles/{vehicleId}/history` | Veículo visível |
| GET | `/organizations/{organizationId}/members` | ADMIN |
| DELETE | `/organizations/{organizationId}/members/{memberId}` | ADMIN; alvo DRIVER sem atribuições |
| POST | `/organizations/{organizationId}/invitations` | ADMIN de FLEET |
| GET | `/organizations/{organizationId}/audit` | ADMIN |
| GET | `/organizations/{organizationId}/notifications` | Membro; comportamento por backend |
| POST | `/organizations/{organizationId}/notifications/read` | Membro; comportamento por backend |

## Critérios de validação futura

- Conferir respostas de sucesso e erro com chamadas locais e publicadas.
- Testar sessão expirada, DRIVER acessando veículo não atribuído e acesso cruzado entre organizações.
- Validar concorrência de convites e consistência das gravações DynamoDB.
- Não declarar entrega de e-mail, notificações ou OAuth apenas pela existência de endpoint ou documento.

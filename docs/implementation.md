# Implementação local — 0.1.0

## Decisões desta etapa

- **MySQL 8.0 local:** relações entre organizações, pessoas, veículos,
  atribuições e históricos; transações para alterações consistentes; chaves
  estrangeiras e isolamento por organização em todas as consultas de negócio.
  A decisão atual substitui o DynamoDB da arquitetura original nesta etapa.
  A imagem local existente foi preservada; a versão de produção deverá ser
  escolhida entre as versões suportadas do RDS na etapa de infraestrutura.
- **TypeScript:** regras e contratos compartilháveis entre API, web e futuro
  cliente mobile. React oferece uma interface responsiva; React Native poderá
  reutilizar os contratos e regras, mas exigirá componentes de interface próprios.
- **API Express:** `createApp()` separado do servidor. A migração para Lambda
  ainda requer adaptador API Gateway, validação de identidade de produção e
  configuração apropriada do pool/conexões MySQL.
- **Desenvolvimento local:** Docker Compose com aplicação, banco e Mailpit.
  `npm run dev` e `npm run deve` sobem o ambiente em `localhost:8080`.
- **Autenticação local:** usuário e senha com bcrypt, cookies HttpOnly,
  SameSite Strict, validade de 12 horas, tokens aleatórios e apenas hashes no
  banco; validação de origem e JSON nas escritas e limite de tentativas de login.
  O modo local se recusa a iniciar em produção. A identidade de produção será
  integrada posteriormente a Cognito/OIDC.
- **Identidade visual:** paleta verde, fundo claro, marca de cuidado automotivo,
  interface com navegação inferior em telas pequenas e manifest de instalação.

## Cobertura funcional

| Requisito                 | Implementação local                                                  |
| ------------------------- | -------------------------------------------------------------------- |
| Gestão do próprio veículo | Garagem pessoal com leitura, trocas e histórico                      |
| Gestão de frota           | Dashboard, lista/cartões, busca, filtros e atribuições               |
| Multiempresa              | Organizações isoladas e seleção do espaço ativo                      |
| RBAC                      | ADMIN gerencia; DRIVER só consulta atribuídos e registra km          |
| Convites                  | Token de uso único por e-mail, hash SHA-256, expiração de 7 dias     |
| Remoção de motorista      | Bloqueada enquanto houver veículo atribuído                          |
| Exclusão de veículo       | Arquivamento preservando leituras, trocas e auditoria                |
| Duplo relógio             | Mineral 5.000, semi 8.000, sintético 12.000 km ou 365 dias           |
| Pré-alerta                | Últimos 500 km ou 30 dias; primeiro limite atingido                  |
| Calibração                | Até 3 leituras reais; lembrete após 30 dias com menos de 3           |
| Previsão                  | Média ponderada pelo tempo entre as 3 últimas leituras               |
| Auditoria                 | Login/logout, convites, leituras, trocas, atribuições e arquivamento |
| Alertas                   | Avaliador automático; avisos no app e e-mails no Mailpit             |
| OBD2                      | Receba total confirmado; conexão automática a hardware pendente      |
| OAuth externo             | Substituído nesta fase pelo login local solicitado                   |
| Push remoto               | Pendente: provedor, subscriptions e credenciais                      |
| Dev/Prod em nuvem         | Planejados para duas stacks Pulumi; sem provisionamento              |
| Resposta abaixo de 200 ms | Meta da especificação; sem medição nesta etapa                       |

### Regras de dados

As leituras reais nunca são substituídas por projeções. Sem duas leituras
separadas por pelo menos um dia, a média fica em zero e a previsão utiliza
apenas o limite temporal. A média usa `(última km − primeira km) / dias` na
janela das três últimas leituras, ponderando os intervalos pelo tempo.

Leituras rejeitam datas futuras, ordem cronológica invertida e redução do
odômetro. Trocas devem ser posteriores à manutenção anterior e coerentes com
as leituras antes e depois da data. Trocar motorista não altera calibração,
histórico ou o ciclo de óleo. Datas são persistidas em UTC.

O odômetro previsto cresce a partir da última leitura real e da média diária.
Pode antecipar um alerta, por isso a interface distingue leitura e estimativa.
Atualize o valor real para recalibrar o cálculo.

### Integrações locais

Mailpit captura e-mails na rede Docker; SMTP sem TLS se limita a esse
transporte local. A camada de envio precisará ser substituída por SES com
identidade verificada no ambiente AWS.

Um registro de notificação é deduplicado por destinatário, veículo, ciclo e
nível. A evolução de pré-alerta para vencimento gera um novo aviso. Uma falha
no SMTP é registrada sem destinatário ou conteúdo e não impede o aviso no app.
O estado de entrega fica no banco e os e-mails pendentes são tentados de novo
na próxima avaliação. Em produção, use uma fila/outbox com lease e backoff:
uma interrupção entre o envio e a confirmação no banco pode duplicar um e-mail.

A seleção OBD2 permite registrar um valor confirmado. Não há implementação
de pareamento Bluetooth/Wi-Fi nesta fase. O PID padrão `01 31` mede distância
desde a limpeza de códigos de falha e não deve ser apresentado como odômetro
total. Perfis por fabricante e adaptador ainda precisam de hardware real.

O manifest permite uma experiência instalável onde suportada. O aplicativo
requer conexão com a API; cache offline e push em segundo plano ainda não
estão implementados.

## API e contrato

Os recursos principais mantêm os caminhos de `docs/openapi.yaml`.
As extensões locais incluem `/api/auth/login`, `/api/auth/logout`,
`/api/auth/register-invited`, `/api/session`, detalhes/histórico de veículo,
auditoria e notificações. O contrato original descreve Cognito; use
`docs/openapi.local.yaml` para o contrato da implementação atual.

## Caminho para AWS

1. Crie um projeto Pulumi com stacks `dev` e `prod`, recursos e credenciais
   isolados. Use o mesmo código da infraestrutura com configurações por stack.
2. Hospede a SPA compilada em S3 privado e CloudFront, e a API em Lambda e API
   Gateway. O servidor Vite não é um servidor de produção.
3. Use RDS MySQL/Aurora compatível após estimar os custos. Defina estratégia de
   conexões Lambda, limites de concorrência, TLS, migrações separadas, backups
   e credenciais via Secrets Manager. RDS Proxy tem custo e deve ser avaliado.
4. Integre Cognito/OIDC, SES, EventBridge e entrega Web Push/FCM/APNs. Implante
   o avaliador como worker agendado, preservando a idempotência.
5. Acrescente CI/CD, DNS e observabilidade; defina e meça a meta de latência.

### Custo e significado de stack

Uma stack Pulumi é uma instância isolada de recursos. `dev` e `prod` podem
usar o mesmo programa IaC e valores diferentes; o nome da stack não define
como o frontend é executado. Docker local não exige uma stack AWS.

É possível automatizar o provisionamento pelo npm, mas `pulumi up` e executar
o processo da aplicação continuam tendo responsabilidades diferentes.
Não vincule o comando cotidiano de desenvolvimento ao provisionamento de
produção.

Segundo as regras atuais, o plano gratuito AWS para novas contas expira no
primeiro dos eventos: seis meses ou esgotamento dos créditos. Benefícios e
limites variam conforme a conta. Não há garantia de gratuidade contínua para
um ambiente com MySQL gerenciado. Sem essa garantia, esta fase usa Docker
local e não cria recursos cobrados.

Fontes oficiais consultadas em 15/10/2026:

- [AWS Free Tier](https://aws.amazon.com/free/free-tier-faqs/)
- [Amazon RDS Free Tier](https://aws.amazon.com/rds/free/)
- [Stacks Pulumi](https://www.pulumi.com/docs/iac/concepts/stacks/)

## Segurança e limites da revisão

Foram aplicados validação por schema, queries parametrizadas, autorização por
organização e recurso, sessões aleatórias, senhas com hash, verificação de
origem e tratamento de erros sem detalhes de infraestrutura. React renderiza
texto de usuário sem HTML arbitrário.

A skill `meli-security-expert` foi consultada como referência preventiva
(SQLi, XSS, CSRF, autenticação, autorização, credenciais e erros). Os SDKs e
serviços privados Fury descritos nela não se aplicam ao destino pessoal AWS
solicitado. Esta implementação não declara conformidade com a plataforma Fury
nem aprovação por um scanner corporativo. Testes automatizados e medições de
carga não foram executados nesta etapa.

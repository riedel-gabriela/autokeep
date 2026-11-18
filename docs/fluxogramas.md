# Fluxogramas — AutoKeep

Revisão da sprint 1 em 16/11/2026. Diagramas Mermaid derivados dos fluxos atuais. A intenção funcional não representa teste de concorrência ou comprovação de deploy.

## Autenticação e autorização — UC-01 a UC-10

```mermaid
flowchart TD
  A[Pessoa informa e-mail e senha] --> B[Validar origem, JSON e limite de tentativas]
  B --> C{Entrada e senha válidas?}
  C -->|Não| D[Rejeitar solicitação]
  C -->|Sim| E[Persistir hash do token e expiração]
  E --> F[Enviar cookie HttpOnly e listar espaços]
  F --> G[Solicitar recurso]
  G --> H{Sessão ainda válida?}
  H -->|Não| I[401: solicitar login]
  H -->|Sim| J{Associado à organização?}
  J -->|Não| K[Negar acesso]
  J -->|Sim| L{Papel e visibilidade permitem a ação?}
  L -->|Não| K
  L -->|Sim| M[Executar operação]
```

Rotas públicas de login, cadastro por convite e saúde não exigem uma sessão prévia. A autorização de organização/recurso se aplica às rotas correspondentes, não a toda requisição.

## Leitura real e recálculo — UC-04 e UC-06

```mermaid
flowchart TD
  A[Informar km, data e origem] --> B[Autenticar e verificar visibilidade do veículo]
  B --> C{Data futura, km menor ou ordem inválida?}
  C -->|Sim| D[Rejeitar sem aceitar leitura]
  C -->|Não| E[Persistir leitura e atualizar veículo]
  E --> F[Consultar dados atualizados]
  F --> G[Selecionar até três leituras reais]
  G --> H{Duas leituras ou mais e intervalo de ao menos um dia?}
  H -->|Não| I[Média diária igual a zero]
  H -->|Sim| J[Média igual à diferença de km dividida pelos dias]
  I --> K[Calcular odômetro previsto sem alterar leituras]
  J --> K
  K --> L[Calcular distância e dias restantes]
  L --> M{Algum limite menor ou igual a zero?}
  M -->|Sim| N[DUE]
  M -->|Não| O{Até 500 km ou até 30 dias?}
  O -->|Sim| P[WARNING]
  O -->|Não| Q[OK]
```

Distância utiliza a projeção; o limite temporal é de 365 dias desde a última troca. No modo MANUAL, calibração é sinalizada com menos de três leituras e pelo menos 30 dias desde a última atualização.

## Convite — UC-07

```mermaid
flowchart TD
  A[ADMIN de frota informa e-mail] --> B{Destinatário já é membro?}
  B -->|Sim| C[409: associação já existente]
  B -->|Não| D[Gerar token e persistir hash com validade de sete dias]
  D --> E[Retornar link com fragmento invite]
  E --> F{Backend local?}
  F -->|Sim| G[Tentar envio no Mailpit]
  F -->|Não| H[Disponibilizar link para copiar sem envio real]
  G --> I[Destinatário abre link]
  H --> I
  I --> J{Já possui conta?}
  J -->|Sim| K[Login e aceite com mesmo e-mail]
  J -->|Não| L[Cadastro com token, nome e senha]
  K --> M{Convite válido e não aceito?}
  L --> M
  M -->|Não| N[Rejeitar]
  M -->|Sim| O[Criar associação DRIVER e marcar aceite]
  O --> P[Consultar espaço após autenticação]
```

O desenho expressa a regra de uso único. No MySQL o aceite usa transação/bloqueio; o DynamoDB atual faz operações separadas e precisa de validação de concorrência.

## Remover motorista — UC-09

```mermaid
flowchart TD
  A[Solicitação de remoção] --> B{Ator é ADMIN do espaço?}
  B -->|Não| C[Negar]
  B -->|Sim| D{Alvo é DRIVER?}
  D -->|Não| E[Rejeitar remoção de gestor]
  D -->|Sim| F{Há veículos ativos atribuídos?}
  F -->|Sim| G[409: desatribuir primeiro]
  F -->|Não| H[Remover associação e registrar auditoria]
  H --> I[204: conta global e histórico preservados]
```

## Avaliador de alertas local — UC-11

```mermaid
flowchart TD
  A[Inicialização ou próxima avaliação] --> B[Consultar organizações e veículos ativos]
  B --> C[Calcular manutenção e calibração]
  C --> D{Precisa de aviso?}
  D -->|Não| J[Continuar avaliação]
  D -->|Sim| E[Selecionar ADMINs e motorista atribuído]
  E --> F[Inserir aviso sem duplicar destinatário e evento]
  F --> G{E-mail ainda pendente?}
  G -->|Não| J
  G -->|Sim| H[Tentar envio ao Mailpit]
  H --> I{Enviado?}
  I -->|Sim| K[Marcar envio confirmado]
  I -->|Não| L[Manter pendente e registrar falha]
  K --> J
  L --> J
  J --> M[Após concluir, agendar próxima avaliação em 15 minutos]
```

Esse worker utiliza MySQL e SMTP local. Não há agendamento remoto implementado; as rotas de notificações no backend DynamoDB ainda são provisórias. Uma interrupção entre envio e confirmação pode duplicar e-mail.

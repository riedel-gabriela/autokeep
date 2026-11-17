# Arquitetura atual do AutoKeep

```text
Docker local: React/Vite + Express ── DynamoDB Local (volume persistente)
                          └──────── Mailpit (captura local)

Nuvem: frontend Vercel ── entrada API Vercel / Lambda Function URL
                          └── mesma API Express ── DynamoDB dev ou prod
```

`src/server/app.ts` contém a única implementação HTTP; `api/index.ts` e
`lambda/index.ts` apenas adaptam os transportes. O servidor de desenvolvimento
adiciona Vite e inicializa exclusivamente a tabela DynamoDB Local.

## Dados e autorização

Partições `ORG#id` agrupam perfil, membros, veículos e auditoria; `USER#id`
agrupam perfil e associações; `CAR#id` agrupa leituras e trocas. Índices de email,
sessões e convites são itens próprios. `NOTIFY#org#user` isola notificações por
organização/destinatário. Não há GSI nem varredura global para alertas.

Login usa bcrypt e sessões opacas com validade de 12 horas. O banco guarda
apenas hash dos tokens. As escritas exigem JSON e origem configurada. ADMIN
gerencia; DRIVER só consulta veículos atribuídos e registra quilometragem.
Convites têm validade de sete dias. TTL físico é auxiliar: validade é conferida
pela API mesmo se a remoção assíncrona do DynamoDB ainda não ocorreu.

A camada atual usa operações individuais DynamoDB. Fluxos que alteram vários
itens não oferecem atomicidade entre itens; testes cobrem os fluxos sequenciais,
não garantem consistência em disputas concorrentes. Endurecer concorrência é
uma evolução separada, especialmente cadastro/aceitação de convite e leituras.

## Manutenção e notificações

Regras compartilhadas calculam distância e 365 dias, prevalecendo o primeiro
limite. A média das três últimas leituras projeta o odômetro sem alterar o real.
Notificações são calculadas sob demanda ao listar avisos; idempotência usa chave
por veículo/ciclo/nível e escrita condicional. Não existe agendador cloud ou
avaliação em background. Marcação de leitura é persistida por destinatário.

Email só usa Mailpit local. Não há SES, SNS, Web Push ou hardware OBD2 conectado.
O SMTP local pode duplicar email se houver interrupção após envio e antes da
confirmação no banco. Não é um transporte de produção.

## Estado AWS

Dev/prod possuem tabelas e Lambdas distintas. A auditoria confirmou Function URL,
sem API Gateway, CloudFront ou Route 53. JWT Cognito, SES/SNS e worker EventBridge
faziam parte de uma proposta antiga, não da infraestrutura implantada.
Consulte `aws-review.md`; esta branch prepara código e não altera a AWS.

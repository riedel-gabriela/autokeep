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
Os avisos da caixa de notificações são calculados sob demanda. A deduplicação
usa uma chave por veículo/ciclo/nível e escrita condicional. A marcação de
leitura é persistida por destinatário.

Os convites de frota por e-mail usam o Mailpit local. O Web Push usa assinaturas por navegador e
reavalia as permissões da frota antes de enviar. Cada dispositivo recebe um
aviso por nível de manutenção no ciclo da troca de óleo. O servidor local
verifica os avisos a cada minuto e a stack dev pode usar EventBridge a cada
15 minutos. SES, SNS e hardware OBD2 ficam fora desse fluxo.

## Estado AWS

Dev/prod possuem tabelas e Lambdas distintas. A auditoria confirmou Function URL,
sem API Gateway, CloudFront ou Route 53. JWT Cognito, SES/SNS e worker EventBridge
faziam parte de uma proposta antiga, não da infraestrutura implantada.
Consulte `aws-review.md`; esta branch prepara código e não altera a AWS.

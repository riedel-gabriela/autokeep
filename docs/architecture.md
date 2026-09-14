# Arquitetura do AutoKeep

## Visão geral

O AutoKeep usa uma arquitetura serverless para manter baixo o custo ocioso. O
CloudFront entrega a SPA a partir de um bucket privado e encaminha `/api/*` ao
API Gateway. O API Gateway valida o JWT do Cognito antes de invocar a Lambda.

```text
Browser/PWA
    |
CloudFront -- S3 privado
    |
API Gateway -- Cognito
    |
Lambda API -- DynamoDB
    |          |
    |          +-- organizações, membros, veículos e auditoria
    +-- SES / SNS

EventBridge -- Lambda worker -- SES / SNS
```

## Modelo single-table

Cada organização ocupa uma partição `ORG#{organizationId}`. Veículos,
membros, leituras, notificações idempotentes e auditorias são separados pelo
sort key. A `GSI1` resolve as organizações de um usuário; a `GSI2` percorre os
veículos para a avaliação diária.

Convites usam uma partição `INVITE#{sha256(token)}` e TTL de sete dias. O token
original aparece somente no e-mail e no fragmento da URL, que o navegador não
envia ao servidor. A aceitação manda o token no corpo de uma requisição POST.

## Autorização

- O API Gateway valida emissor, assinatura e audiência do token.
- O handler obtém `sub` e `email` somente das claims validadas.
- Toda operação consulta a associação do usuário à organização.
- Operações administrativas exigem `ADMIN`.
- Um `DRIVER` só lê veículos atribuídos e só atualiza seu odômetro.
- Trocar o motorista não altera histórico, média ou âncoras de manutenção.

## Duplo relógio

O domínio calcula em paralelo a distância restante para o limite do óleo e os
dias restantes para 365 dias. O primeiro limite atingido gera o alerta. Um
pré-aviso temporal ocorre 30 dias antes e um pré-aviso de distância ocorre nos
últimos 500 km.

No modo manual, até três leituras formam uma média móvel de quilômetros por
dia. O worker usa essa média para projetar o odômetro sem substituir a última
leitura real.

## Limite da integração OBD2

O PID padrão `01 31` informa a distância desde a limpeza dos códigos de falha,
não o odômetro total. Muitos fabricantes expõem o odômetro apenas por PIDs
proprietários. O cliente Bluetooth lê o PID padrão como auxílio, mostra essa
distinção e exige confirmação do painel. Perfis específicos por fabricante
podem ser adicionados à abstração sem alterar a API.

## Push

O worker publica eventos no tópico SNS e o service worker já processa eventos
Web Push. A entrega remota ao navegador requer conectar um provedor push e
persistir subscriptions; para apps nativos, requer credenciais FCM/APNs. Essa
integração depende das credenciais do produto e permanece deliberadamente fora
do código e do estado não secreto do repositório.

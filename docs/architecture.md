# Arquitetura do AutoKeep

```text
Docker/Codespaces: React/Vite + Express → DynamoDB Local

AWS dev: navegador → Function URL da Lambda (frontend e API) → autokeep-dev

AWS prod: navegador → Route 53 → CloudFront → S3 privado
                                         └→ API Gateway HTTP → Lambda → autokeep-prod
```

`src/server/app.ts` implementa a API; `lambda/index.ts` adapta os eventos AWS.
O servidor local adiciona Vite. A hospedagem AWS é gerenciada pelo Pulumi,
com HTTPS; apenas produção usa domínio próprio e certificado ACM associado.

## Identidade e autorização

Produção autentica com Google OAuth. Desenvolvimento abre a conta pessoal de
teste somente mediante flags explícitas do servidor. Sessões opacas duram até
12 horas; somente o hash do token é persistido. Cookies são HttpOnly e usam
Secure quando a origem é HTTPS. Escritas exigem JSON e a origem configurada.

Cada acesso à garagem exige vínculo de proprietário e tipo pessoal. Não há
papéis de gestor/motorista na interface nem endpoints de gestão de frota.
As estruturas de associação antigas continuam no armazenamento por
compatibilidade, sem exposição de dados de outras contas.

## Persistência

`USER#id` guarda perfil e associações; `ORG#id`, o perfil da garagem, veículos
e auditoria; `CAR#id`, leituras e trocas. Índices de e-mail, sessões e
notificações usam itens próprios. TTL auxilia a remoção de sessões expiradas;
a API também valida a expiração. Arquivar um veículo preserva seu histórico.

O cadastro da identidade Google usa escrita transacional. Fluxos de manutenção
que fazem várias escritas individuais ainda precisam de análise específica
para disputas concorrentes; os testes sequenciais não garantem atomicidade.

A modelagem editável e as chaves estão em [data-model.md](data-model.md).

## Manutenção e notificações

O cálculo compartilhado considera distância e tempo. A média das últimas
leituras projeta o uso sem alterar o odômetro real. Notificações no app são
avaliadas sob demanda e deduplicadas por ciclo/nível. Web Push é opcional e
exige chaves e permissão do navegador; não há entrega real comprovada apenas
pelos testes simulados.

E-mail cloud, GPS, Bluetooth automático e offline não estão implementados.
Não há dependência de RDS, Cognito, Vercel, SES ou SNS na execução atual.

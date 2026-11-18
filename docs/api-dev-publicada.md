# API de desenvolvimento publicada na AWS

Verificação em 18/11/2026. Publicação realizada pelo Pulumi somente na stack dev.

## Endpoint e recursos

- API base: <https://byy7qmnzsi.execute-api.us-east-1.amazonaws.com>.
- Saúde: <https://byy7qmnzsi.execute-api.us-east-1.amazonaws.com/api/health>.
- Conta: `746931977047`; região: `us-east-1`.
- Stack: `vinicius-m16-aluno-ifsc-edu-br-org/autokeep/dev`.
- Função: `autokeep-dev-api`, Node.js 24, handler `index.handler`, 512 MB e timeout 30 s.
- Role: `autokeep-dev-api-role`, assumida somente pelo serviço Lambda.
- Banco: `autokeep-dev`; não utiliza a tabela local nem autokeep-prod.
- Logs: `/aws/lambda/autokeep-dev-api`, retenção de 14 dias.

O API Gateway HTTP usa integração AWS_PROXY, payload 2.0 e rota
`ANY /api/{proxy+}`. O estágio default é publicado automaticamente, com limite
de 5 requisições/s e burst 10. Esses limites não são uma garantia de custo máximo.

## Permissões

A política inline da role permite somente GetItem, PutItem, DeleteItem e Query
na ARN exata da tabela autokeep-dev. Logs permitem criar streams e escrever
eventos apenas no grupo da função, criado pelo Pulumi. Não há chaves AWS nas
variáveis da função: o runtime fornece credenciais temporárias da role.

A permissão de invocação é limitada ao API Gateway da conta e caminhos /api/*.
O endpoint é público para receber HTTP; sessão, organização e papel são validados
pela aplicação. Saúde não exige login. Não foi habilitado Cognito nem CORS amplo.

APP_ORIGIN corresponde à própria origem HTTPS da API. A conexão de um frontend
em outro domínio deve ser planejada antes de alterar origem/cookies/CORS.
SEED_DEMO=false: esta publicação não cria contas nem popula dados de demonstração.

## Evidências

- Preview revisado: nove recursos a criar, três recursos existentes inalterados.
- Up concluído: Lambda, role, política, grupo de logs, API HTTP, integração,
  permissão de invocação, rota e estágio criados.
- AWS confirmou Lambda Active e LastUpdateStatus Successful.
- CloudWatch retornou registros REPORT das invocações de teste no grupo da função,
  confirmando a entrega dos logs pela role configurada.
- Verificação HTTP real: health 200, sessão ausente 401, origem inválida 403 e
  login de usuário fictício inexistente 401. Nenhum dado de negócio foi criado.
- Simulação IAM real: as quatro operações DynamoDB foram allowed em autokeep-dev
  e implicitDeny em autokeep-prod. A simulação não leu nem gravou dados de prod.
- Cinco testes de infraestrutura com mocks aprovados e TypeScript sem erros.
- A stack prod permaneceu com três recursos e a mesma data de última atualização.

## Reproduzir build e publicação

```powershell
npm ci
npm ci --prefix infra
npm run build:lambda
npm run check --prefix infra
npm test --prefix infra
pulumi -C infra preview --stack vinicius-m16-aluno-ifsc-edu-br-org/autokeep/dev
pulumi -C infra up --stack vinicius-m16-aluno-ifsc-edu-br-org/autokeep/dev
```

O build gera `dist/lambda/index.cjs` e `dist/autokeep-lambda.zip` usando esbuild
e fflate, sem depender de `zip` ou PowerShell Archive. Pulumi empacota apenas
`index.cjs` por AssetArchive; arquivos .env e fixtures não são incluídos.

`autokeep:enableApi=true` habilita a API em dev. Por padrão fica desativado;
o código rejeita essa opção em prod nesta etapa. Compile antes de preview/up:
arquivo ausente gera erro explícito.

## Conferir endpoint e saúde

```powershell
pulumi -C infra stack output apiEndpoint --stack vinicius-m16-aluno-ifsc-edu-br-org/autokeep/dev
node scripts/verify-dev-api.mjs https://byy7qmnzsi.execute-api.us-east-1.amazonaws.com
aws logs tail /aws/lambda/autokeep-dev-api --since 10m --profile autokeep-dev --region us-east-1
```

O verificador HTTP não utiliza senhas reais, tokens ou credenciais AWS e não
cria dados. As fixtures dos testes locais não foram enviadas ao banco da nuvem.

## Próximos passos e limites

- Preparar contas de desenvolvimento por procedimento controlado, se necessário,
  antes de validar login válido e gravações reais neste banco.
- Integrar o frontend ao endpoint; a publicação Vercel não foi alterada.
- DNS, domínio próprio, CDN e certificado personalizado continuam pendentes.
- Prod recebeu apenas as tabelas na etapa anterior; não possui essa API.
- Avaliar implantação de produção e seus controles separadamente.

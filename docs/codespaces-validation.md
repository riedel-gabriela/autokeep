# Validação do Codespaces — 17/11/2026

> Documento histórico: descreve observações de 17–18/11/2026, não a configuração atual. Para executar a versão atual, use o [README](../README.md), a [arquitetura](architecture.md) e o [guia Pulumi](../pulumi-start-aws/README.md).

> Registro histórico anterior ao deploy AWS. Veja a atualização de 18/11/2026
> no final para o estado da hospedagem e o que falta validar.

Inspeção no Codespaces existente `animated-space-zebra-979r6jgq7vrf7ggq`,
aberto no navegador. Não foi criado outro Codespace nem recurso AWS.

## Checkout e ferramentas

- Pasta remota: `/workspaces/autokeep`.
- Branch `main`, commit `ac69017438c754fbc9cd6337b4be52f421832e75`.
- `package-lock.json` já estava modificado. Alteração preservada.
- Node.js `v24.22.2`, Docker Compose `v5.6.1`, plataforma Linux x86_64.
- `docker ps` respondeu sem containers em execução.
- AWS CLI e Pulumi não estavam no PATH nem nas pastas locais verificadas.
  Para consultas, foram baixados dos distribuidores oficiais para
  `/tmp/autokeep-validation-tools`; Pulumi `v3.276.0`.
- Nenhum comando `npm ci`, reconstrução ou teste foi executado no checkout
  antigo, para não validar a versão errada nem substituir seu lockfile.

## Secrets e acesso AWS

Foi verificada somente a presença dos nomes de variáveis. Os valores não
foram impressos nem copiados para arquivos do projeto.

| Variável | Estado |
| --- | --- |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Presentes |
| `AWS_SESSION_TOKEN` | Ausente; a identidade observada é um usuário IAM |
| `AWS_REGION` | Ausente; consultas usaram `--region us-east-1` explicitamente |
| `PULUMI_ACCESS_TOKEN` | Presente |
| `PULUMI_BACKEND_URL` | Ausente |

`sts get-caller-identity` confirmou a conta `672791231338` e o usuário IAM
`autokeep-deploy`, compatíveis com os recursos anteriormente auditados.

As operações globais `dynamodb:ListTables` e `lambda:ListFunctions` foram
negadas. As consultas direcionadas aos nomes conhecidos funcionaram, sem
mudança de permissões:

| Recurso consultado | Resultado |
| --- | --- |
| DynamoDB `autokeep-dev` | ACTIVE |
| DynamoDB `autokeep-prod` | ACTIVE |
| Lambda `autokeep-api-dev` | Runtime nodejs24.x |
| Lambda `autokeep-api-prod` | Runtime nodejs24.x |

Essa restrição de listagem não impede as consultas direcionadas testadas e
não justifica conceder permissões amplas. Não foram testados writes ou deploys.

## Estado real do Pulumi

Autenticação do token: `riedel-gabriela`. `pulumi stack ls --json` no projeto
`autokeep`, seguido de `stack ls --all --json` filtrado para AutoKeep, mostrou
somente:

| Backend/organização/projeto | Stack | Recursos no estado | Última atualização |
| --- | --- | --- | --- |
| app.pulumi.com / riedel-gabriela-org / autokeep | dev | 0 | 24/09/2026 00:47:55 UTC |

**Não foi encontrada stack prod entre as stacks AutoKeep acessíveis por esse
token. A stack dev existe, mas está vazia.** Os recursos dev/prod da AWS não
estão gerenciados por esse estado Pulumi. Não houve `stack init`, importação,
`pulumi up`, `destroy` ou alteração de backend.

## Próxima etapa: validar o código atualizado

O Codespaces ainda contém a versão antiga. A aplicação atualizada permanece
na branch local `refactor/simplify-dynamodb` e ainda não foi enviada ao GitHub.
Foi preparado `autokeep-codespaces-validation.tar.gz` (aproximadamente 825 KB)
com somente código/documentação, sem `.git`, secrets, dependências ou builds.

O envio e a extração em pasta separada aguardam autorização. Isso preservará
a main e o lockfile existentes, sem push ou deploy. Após a transferência:

1. Instalar as dependências na pasta de validação.
2. Executar testes unitários, integração com DynamoDB Local e builds.
3. Subir Compose com projeto isolado e verificar portas privadas 8080/8025.
4. Testar login, Mailpit, convites e persistência pela URL HTTPS real.

O suporte de URLs já passou em testes locais simulando o encaminhamento, mas
**a execução da aplicação atualizada no Codespaces real ainda não foi validada**.
Nenhuma cobrança adicional AWS foi introduzida nesta verificação.

## Preparação Pulumi no checkout local — 18/11/2026

Foram adicionados arquivos de configuração explícitos para `dev` e `prod` e
atualizado `pulumi-start-aws/index.ts` para importar as duas tabelas e as duas
Lambdas existentes, com proteção contra exclusão e retenção. Valores de
credenciais não foram adicionados ao repositório. `npm run check` passou para
o projeto Pulumi local.

Na retomada, a sessão do navegador informou que o host de acesso ao browser
estava indisponível. O checkout local também não tinha os executáveis `pulumi`
ou `aws`; portanto não foi possível executar `pulumi preview` naquela sessão.
Este registro é histórico; a implantação foi executada depois e está descrita
abaixo.

## Hospedagem AWS publicada — 18/11/2026

No Codespace `animated-space-zebra`, a CloudFront Function
`autokeep-prod-spa-rewrite` foi publicada em `LIVE`. Em seguida, `pulumi preview
--diff` mostrou 4 recursos a criar e 36 inalterados. A atualização #10 da stack
`prod` concluiu sem erros: criou a distribuição CloudFront, policy de leitura
S3 e registros Route 53 A/AAAA; 36 recursos ficaram inalterados.

O site `https://autokeep.negoci.online` foi aberto com sucesso. Ainda não foram
registrados testes AWS de login, gravação/leitura ou isolamento entre
organizações. A configuração versionada de `Pulumi.prod.yaml` deve espelhar o
estado aplicado (`hostingEnabled`, `customDomainEnabled` e `appOrigin` ativos).
O procedimento para atualização e os limites de `pulumi destroy` estão no
[`guia Pulumi`](../pulumi-start-aws/README.md).

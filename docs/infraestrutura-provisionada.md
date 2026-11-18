# Stacks e banco provisionados

Data de verificação: 18/11/2026 (America/Sao_Paulo).

## Recursos confirmados

Conta AWS: `746931977047`. Região: `us-east-1`.

Organização Pulumi: `vinicius-m16-aluno-ifsc-edu-br-org`. Projeto: `autokeep`.

| Ambiente | Stack Pulumi | Tabela DynamoDB | Estado AWS | Leitura / escrita | Proteção contra exclusão |
| --- | --- | --- | --- | --- | --- |
| dev | [dev](https://app.pulumi.com/vinicius-m16-aluno-ifsc-edu-br-org/autokeep/dev) | autokeep-dev | ACTIVE | 5 RCU / 5 WCU | Pulumi |
| prod | [prod](https://app.pulumi.com/vinicius-m16-aluno-ifsc-edu-br-org/autokeep/prod) | autokeep-prod | ACTIVE | 5 RCU / 5 WCU | Pulumi e AWS |

Ambas usam chave de partição String `pk`, chave de ordenação String `sk`, classe STANDARD e capacidade PROVISIONED. Não foram adicionados índices secundários. São tabelas novas nesta conta; dados do site publicado na Vercel não foram migrados.

## Evidências

- `pulumi preview` foi executado e revisado antes de cada aplicação.
- `pulumi up` terminou com sucesso para dev e prod; cada stack possui o registro de stack, provedor AWS e tabela.
- `aws dynamodb describe-table` confirmou ACTIVE, chaves, capacidade e proteção de cada tabela.
- `pulumi stack ls --json` confirmou as duas stacks sem atualizações em andamento.
- Verificação TypeScript e quatro testes locais da infraestrutura aprovados.
- O domínio é opcional no modo `enableDns=false`; teste específico confirma ausência de recursos Route 53 nesse modo.

## Acesso e limites

O perfil local `autokeep-dev` foi usado para as duas stacks na mesma conta. Isso não compartilha os dados das tabelas. A identidade utilizada no provisionamento era root; a adoção de uma identidade IAM com permissões adequadas continua recomendada para o trabalho cotidiano. Nenhum usuário IAM ou nova credencial foi criado.

Os arquivos de configuração não contêm chaves AWS. A autenticação permanece no perfil/armazenamento local do AWS CLI e do Pulumi.

O DNS está desativado nas duas stacks: nenhum domínio foi registrado e nenhuma zona ou registro Route 53 foi criado. Os avisos de outputs de DNS indefinidos durante o deploy são esperados nesse modo e não indicam falha na criação das tabelas.

Atualização de 18/11/2026: [Lambda e API Gateway dev foram publicados](api-dev-publicada.md),
com saúde confirmada usando a role de execução. A tabela prod permanece sem API.
Frontend na AWS, certificados personalizados, e-mail e CI/CD ainda não foram
provisionados. O site Vercel não foi reconfigurado e não foram criados dados de
negócio nos bancos AWS pelos testes desta publicação.

## Conferir posteriormente

```powershell
pulumi -C infra stack ls
pulumi -C infra stack output --stack vinicius-m16-aluno-ifsc-edu-br-org/autokeep/dev
aws dynamodb describe-table --table-name autokeep-dev --profile autokeep-dev --region us-east-1
aws dynamodb describe-table --table-name autokeep-prod --profile autokeep-dev --region us-east-1
```

Para retomar DNS, definir domínio autorizado e destino de hospedagem, alterar `enableDns=true` e revisar o preview. Consulte [infra/README.md](../infra/README.md).

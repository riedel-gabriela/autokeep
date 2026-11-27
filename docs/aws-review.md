# AWS: inventário e limpeza

Revisão de 26/11/2026, conta 672791231338, região us-east-1 e serviços globais
usados pelo AutoKeep. Branch: refactor/personal-garage.

## Recursos em uso

| Recurso      | Desenvolvimento                        | Produção                                           |
| ------------ | -------------------------------------- | -------------------------------------------------- |
| DynamoDB     | autokeep-dev                           | autokeep-prod                                      |
| Lambda       | autokeep-api-dev                       | autokeep-api-prod                                  |
| Entrada HTTP | Function URL existente, frontend e API | API Gateway HTTP existente                         |
| Frontend     | Incluído no pacote da Lambda           | Bucket S3 privado e CloudFront existentes          |
| DNS/HTTPS    | HTTPS gerenciado da Function URL       | autokeep.negoci.online, Route 53 e ACM             |
| Autenticação | Conta pessoal de teste, botão Entrar   | Google OAuth; segredo existente no Secrets Manager |

O inventário confirmou uma distribuição CloudFront, um bucket S3, uma API
Gateway HTTP, uma zona DNS e um segredo OAuth usados por produção. Há duas
Lambdas e duas tabelas, correspondentes aos ambientes separados; não são
recursos redundantes. RDS, EC2, volumes EBS e Elastic IPs retornaram listas
vazias na região consultada. Não havia regras EventBridge ativas.

## Limpeza aplicada

- Removidos a Function URL legada de autokeep-api-prod e seus dois grants públicos.
  A única entrada de produção é o API Gateway; sua permissão foi preservada.
- Substituídos os bundles JavaScript/CSS antigos no S3 pelo build pessoal.
- Removidas variáveis antigas de demonstração da Lambda de produção.
- Dev reutiliza sua Function URL e permissões existentes, agora adotadas pelo
  Pulumi. Nenhuma segunda CDN, API Gateway, zona DNS ou bucket foi criada.
- Repositório sem adapter/configuração Vercel, Mailpit, senha de demonstração,
  convites e gestão de frotas. O container local Mailpit foi removido.
- Dados legados permanecem no DynamoDB, inacessíveis pela interface pessoal;
  não houve exclusão de tabelas ou de dados de usuários.

## Validação operacional

As duas stacks foram aplicadas e os fluxos pessoais executados. DNS delegado,
HTTPS, frontend e API do domínio responderam após a limpeza. Produção rejeita
POST /api/auth/dev-login e informa apenas Google como provedor habilitado.

Para conferir se a revisão publicada continua alinhada à infraestrutura:

    cd pulumi-start-aws
    pulumi preview --stack dev --expect-no-changes
    pulumi preview --stack prod --expect-no-changes

O ajuste de origem S3 com OAC evita a diferença recorrente de origins no
CloudFront. O provider ainda emite avisos de depreciação dos tipos BucketV2 e
BucketServerSideEncryptionConfigurationV2; os avisos não bloqueiam a aplicação.
A migração desses tipos deve usar aliases e preview sem recriação do bucket.

## Custos e limites

Esta revisão reutilizou serviços existentes. Houve chamadas de teste e troca
de artefatos; isso não garante consumo zero. Créditos e franquias não são um
limite técnico de gastos. Consulte o Billing antes de habilitar recursos
opcionais; nenhum serviço pago adicional foi habilitado nesta revisão.

O comando destroy continua sujeito às proteções e retenções descritas no
[guia Pulumi](../pulumi-start-aws/README.md). Não é um desligamento temporário.

## Nova conferência após revisão do repositório

Em 26/11/2026, consultas ao vivo pelo Codespace confirmaram o inventário acima
na conta esperada. Também retornaram listas vazias: APIs REST do API Gateway,
NAT Gateways, balanceadores ELBv2 e repositórios ECR em us-east-1. O bucket
contém o build publicado e seus ícones/fontes; não foram encontrados bundles
antigos adicionais. A policy de invocação de produção contém somente a
permissão do API Gateway esperado.

Os grupos de logs das duas Lambdas têm retenção de 7 dias; não foi encontrado
grupo extra na consulta.

Os previews das revisões publicadas retornaram 7 recursos sem alterações em
dev e 42 em prod. Nenhum recurso AWS foi criado ou removido nesta nova
conferência. Os ajustes de documentação/estilos locais posteriores ao preview
não foram publicados por essa consulta.

Limite da revisão: não é um inventário de todas as regiões da conta. A leitura
das políticas anexadas ao usuário autokeep-deploy falhou com AccessDenied em
iam:ListAttachedUserPolicies. Portanto, não foi possível certificar o menor
privilégio desse usuário; nenhuma permissão foi ampliada para fazer a revisão.

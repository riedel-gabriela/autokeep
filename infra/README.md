# Infraestrutura AutoKeep — sprint 2

Esta é a pasta oficial de IaC. `pulumi-start-aws/` é um exemplo histórico e não deve ser aplicado para publicar o AutoKeep.

## Recursos e limites

- Projeto Pulumi `autokeep`, stacks `dev` e `prod`.
- DynamoDB com chaves `pk`/`sk`, compatível com `src/server/dynamo.ts`.
- O padrão do código para dev, sem configuração explícita, é referenciar a tabela. As stacks configuradas neste checkout usam `create`: as duas tabelas foram criadas em 18/11/2026. Veja [as evidências](../docs/infraestrutura-provisionada.md).
- `prod` define uma nova tabela `autokeep-prod`, 5 RCU/5 WCU, sem GSIs e com proteção contra exclusão.
- Tabelas gerenciadas e zonas criadas são protegidas pelo Pulumi. Excluir exige revisão explícita de proteção.
- Zona Route 53 pública nova por ambiente, ou referência a uma zona existente via `hostedZoneId`.
- Registro TXT `_autokeep` identifica projeto/ambiente. CNAME `app` é criado somente com um `siteTarget` real informado pela hospedagem.
- Não registra/compra domínio, não altera zona pai em outra conta e não cria Lambda, certificado ou CDN nesta etapa.

`preview`/`up` reais exigem autenticação AWS/Pulumi, conta correta e domínio autorizado. Testes com mocks não comprovam deploy, permissões ou delegação DNS.

## 1. Instalar ferramentas no Windows

```powershell
winget install --exact --id Pulumi.Pulumi
winget install --exact --id Amazon.AWSCLI
```

Reabra o terminal e confira `pulumi version`, `aws --version` e `node --version` (Node >=22.12).

## 2. Autenticar sem colocar chaves no repositório

```powershell
pulumi login
pulumi whoami
```

`pulumi login` usa Pulumi Cloud por padrão. Escolha a organização/usuário que será dono das duas stacks.

Para uma conta com IAM Identity Center já configurado:

```powershell
aws configure sso --profile autokeep-dev
aws sso login --profile autokeep-dev
aws sts get-caller-identity --profile autokeep-dev
```

AWS Academy/Learner Lab não pressupõe SSO: use as credenciais temporárias disponibilizadas pelo laboratório, incluindo o token de sessão, no perfil/ambiente local. Permissões para Route 53 podem ser restritas pelo laboratório. Não envie chaves pelo chat e não versione credenciais. O perfil de produção pode apontar para outra conta.

## 3. Dependências e verificações sem nuvem

```powershell
npm ci --prefix infra
npm run check --prefix infra
npm test --prefix infra
```

Os testes usam mocks: verificam configurações inválidas, isolamento dos nomes, formato das chaves, conta permitida e registros DNS. Não consultam AWS nem exigem token Pulumi.

## 4. Registrar e configurar cada stack

### Avançar sem domínio: somente stacks e banco

Use `-NoDns` para configurar `autokeep:enableDns=false`. Nesse modo não é
necessário informar domínio, não são criados recursos Route 53 e o programa
exporta apenas informações do banco e o status de DNS desativado.

```powershell
.\scripts\configure-infra.ps1 -Stack dev -Organization SUA_ORGANIZACAO -AccountId SUA_CONTA_12_DIGITOS -NoDns -TableMode create -AwsProfile autokeep-dev
.\scripts\configure-infra.ps1 -Stack prod -Organization SUA_ORGANIZACAO -AccountId SUA_CONTA_12_DIGITOS -NoDns -TableMode create -AwsProfile autokeep-dev
```

Use `create` somente se a tabela ainda não existir na conta/região confirmadas;
para tabela existente, use referência ou importação conforme a seção abaixo.
Confira a organização real com `pulumi whoami --verbose`: ela pode ser diferente
do nome de usuário. O perfil pode ser compartilhado entre stacks na mesma conta;
os bancos permanecem separados por nome. Configurar não executa `up`.

### Configurar DNS posteriormente

Escolha domínios diferentes, começando pelo nome da stack, por exemplo `dev.seu-dominio.com` e `prod.seu-dominio.com`. O código exige esse prefixo para impedir que os dois ambientes criem o mesmo registro. São exemplos: substitua pelos nomes realmente autorizados. O site ficará em `app.dev.seu-dominio.com` e `app.prod.seu-dominio.com`.

```powershell
.\scripts\configure-infra.ps1 -Stack dev -Organization SEU_USUARIO_OU_ORG -AccountId SUA_CONTA_12_DIGITOS -DomainName dev.seu-dominio.com -AwsProfile autokeep-dev
.\scripts\configure-infra.ps1 -Stack prod -Organization SEU_USUARIO_OU_ORG -AccountId SUA_CONTA_12_DIGITOS -DomainName prod.seu-dominio.com -AwsProfile autokeep-prod
```

O script verifica o login Pulumi e a identidade AWS, registra/seleciona a stack e salva configuração. Não executa `up`. Para usar zona existente, informe `-HostedZoneId Z...`. O programa verifica se a zona é pública e contém o domínio solicitado.

Na Vercel, adicione o domínio da aplicação ao projeto e obtenha o destino DNS exato indicado no painel; não adivinhe o destino. Salve-o para o ambiente:

```powershell
pulumi -C infra config set siteTarget DESTINO_REAL_DA_HOSPEDAGEM --stack SEU_USUARIO_OU_ORG/autokeep/dev
```

Após alterar o domínio público, a configuração `APP_ORIGIN` da aplicação deve corresponder à origem HTTPS completa. Adicionar DNS não configura certificado nem domínio no provedor de hospedagem.

### Configurações

| Chave | Uso |
| --- | --- |
| `aws:region` | Região dos recursos; padrão us-east-1 |
| `aws:profile` | Perfil local opcional; não usar nome de perfil inexistente em CI |
| `autokeep:accountId` | Conta AWS permitida; obrigatório |
| `autokeep:enableDns` | false para somente banco; padrão true quando ausente |
| `autokeep:domainName` | Domínio/subdomínio do ambiente; obrigatório somente com DNS ativado |
| `autokeep:tableMode` | reference, create ou import |
| `autokeep:tableName` | Nome deve terminar em -dev ou -prod conforme stack |
| `autokeep:importTableId` | Nome confirmado para adoção no modo import |
| `autokeep:hostedZoneId` | Zona existente; ausente cria zona pública |
| `autokeep:siteTarget` | Destino CNAME real; ausente deixa publicação DNS do site pendente |

Os arquivos de stack desta pasta são versionáveis e só devem conter configuração não secreta. Use `pulumi config set --secret` para futuros segredos; não grave chaves AWS neles.

## 5. Tabela existente: referência ou importação

Antes de mudar o gerenciamento, confira conta/região e tabela:

```powershell
aws dynamodb describe-table --table-name autokeep-dev --region us-east-1 --profile autokeep-dev
```

Em `reference`, Pulumi só lê o recurso. Não executa alterações nem assume seu ciclo de vida. Isso atende a incorporação por referência sem recriar os dados existentes.

Para assumir gerenciamento, configure `tableMode=import` e `importTableId=autokeep-dev` na stack dev. O recurso usa a opção de importação do Pulumi. Compare nome, chaves pk/sk, capacidade e classe com a tabela real. Se diferirem, ajuste o programa antes de aplicar. Não há permissão para descartar dados implícita na importação. TTL, PITR e criptografia são ignorados para alterações durante adoção; revise a política desses campos separadamente.

Uma tabela já gerenciada por outro estado/stack não deve ser importada novamente. Nunca utilize a mesma tabela em dev e prod.

## 6. Preview, aplicação e delegação DNS

```powershell
pulumi -C infra preview --stack SEU_USUARIO_OU_ORG/autokeep/dev
pulumi -C infra up --stack SEU_USUARIO_OU_ORG/autokeep/dev
pulumi -C infra stack output delegationNameServers --stack SEU_USUARIO_OU_ORG/autokeep/dev
pulumi -C infra stack output dnsStatus --stack SEU_USUARIO_OU_ORG/autokeep/dev
```

Revise o preview antes de confirmar `up`. Tabelas, zonas e uso de serviços podem gerar cobrança; cotas são compartilhadas por conta/região.

Uma zona nova não funciona publicamente até que seus nameservers sejam delegados. Para subdomínio fornecido pelo professor, entregue os NS ao responsável pela zona pai; para domínio próprio, configure a delegação no registrador/zona pai. Não é necessário comprar outro domínio para usar subdomínios autorizados.

Se usar `hostedZoneId` de zona já delegada, crie os registros nela. Não sobrescrevemos registros existentes automaticamente: conflitos precisam de revisão/importação.

## 7. Evidências para concluir a sprint

```powershell
pulumi -C infra stack ls
Resolve-DnsName -Type NS dev.seu-dominio.com
Resolve-DnsName -Type TXT _autokeep.dev.seu-dominio.com
Resolve-DnsName -Type CNAME app.dev.seu-dominio.com
```

Repita para prod. Em zona pai existente, consulte os NS da própria zona em vez de presumir delegação específica no subdomínio. Registre preview, outputs e resolução DNS sem expor segredos. Verifique acesso à tabela e o destino correto de cada ambiente.

## Documentação oficial

- [Instalar Pulumi](https://www.pulumi.com/docs/install/)
- [AWS CLI e SSO](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html)
- [Credenciais AWS no Pulumi](https://www.pulumi.com/registry/packages/aws/installation-configuration/)
- [Tabela e importação](https://www.pulumi.com/registry/packages/aws/api-docs/dynamodb/table/)
- [Registros Route 53](https://www.pulumi.com/registry/packages/aws/api-docs/route53/record/)

# Desenvolvimento no GitHub Codespaces

O Codespaces é o ambiente de desenvolvimento, não uma terceira stack AWS.
O fluxo padrão executa aplicação, DynamoDB Local e Mailpit dentro do Codespaces.
Os secrets AWS ficam disponíveis no terminal para operações explícitas de
infraestrutura; não são necessários para executar ou testar a aplicação local.

## Preparação e execução

1. Abra a branch `refactor/simplify-dynamodb` no Codespaces. Não crie um
   Codespace adicional se já houver um para o projeto. O consumo do Codespaces
   tem sua própria franquia/faturamento no GitHub, separado dos créditos AWS.
2. Se o Codespace já existia antes de `.devcontainer/devcontainer.json`, use
   **Codespaces: Rebuild Container**. A configuração prepara Node.js 24,
   Docker/Compose e AWS CLI e executa `npm ci`. Não provisiona AWS nem inicia
   a aplicação automaticamente.
3. No terminal da raiz, execute:

   ```sh
   npm run dev
   ```

4. Abra a porta **8080** na aba **Ports**. A porta **8025** abre o Mailpit.
   Mantenha a visibilidade das duas portas **Private**. O banco não tem porta
   encaminhada. O backend local usa HTTP; a URL externa encaminhada usa HTTPS.
5. Consulte os perfis/senha local com `npm run credentials`. Para parar,
   execute `npm run down`. Não acrescente `-v` se quiser preservar o banco.

O script deriva URLs usando `CODESPACE_NAME` e
`GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN`. Para um Codespace chamado
`demo-space-123`, por exemplo:

```text
Aplicação: https://demo-space-123-8080.app.github.dev
Mailpit:   https://demo-space-123-8025.app.github.dev
```

Essa origem é usada na validação das escritas, nos cookies e nos convites.
O Vite aceita o hostname específico do ambiente, sem liberar todos os hosts.
Os links de e-mail também usam a porta encaminhada, sem apontar para o
localhost do computador de quem abriu o navegador. Não basta trocar apenas
o endereço exibido no README.

## Secrets e separação dos ambientes

Secrets do Codespaces são diferentes dos secrets de GitHub Actions. Precisam
estar autorizados para este repositório e disponíveis no Codespace. Após
adicionar/alterar secrets, reinicie o Codespace conforme orientação do GitHub.
Não copie seus valores para este documento, commits, imagens ou mensagens.

| Variável                                     | Uso                                                                                                                          |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Credenciais do terminal para consultas/deploy explicitamente autorizados.                                                    |
| `AWS_SESSION_TOKEN`                          | Necessária quando as credenciais são temporárias.                                                                            |
| `AWS_REGION` / `AWS_DEFAULT_REGION`          | Região dos comandos AWS; recursos auditados em `us-east-1`.                                                                  |
| `PULUMI_ACCESS_TOKEN`                        | Somente se o backend Pulumi escolhido exigir autenticação por token.                                                         |
| `DEMO_PASSWORD` em `.env`                    | Senha exclusiva da demonstração local. O script dá prioridade a esse arquivo, mesmo se houver secret cloud com o mesmo nome. |
| `APP_ORIGIN` do container local              | Derivada pelo script; não usa a origem de produção herdada do terminal.                                                      |
| `VITE_MAILPIT_URL`                           | Apenas URL pública de desenvolvimento, fornecida ao frontend. Nunca prefixar credenciais AWS com `VITE_`.                    |

O Compose fixa credenciais fictícias `local`, limpa `AWS_SESSION_TOKEN` e aponta
para `http://db:8000`, tabela `autokeep-local`. Não recebe os secrets AWS reais
do terminal. Não há `env_file` copiando todos os secrets para o container.
Executar `npm run dev` não consulta DynamoDB remoto nem inicia Pulumi.

Não existe migração automática do antigo volume MySQL. Os dados anteriores
permanecem no volume antigo; o DynamoDB Local tem um volume próprio.

## Conferir a identidade e os recursos AWS

Somente quando precisar auditar a conta, no terminal do Codespaces:

```sh
aws sts get-caller-identity --query '{Account:Account,Arn:Arn}' --output json
aws dynamodb describe-table --table-name autokeep-dev --region us-east-1 --query 'Table.{Name:TableName,Status:TableStatus}' --output json
aws lambda get-function-configuration --function-name autokeep-api-dev --region us-east-1 --query '{Name:FunctionName,Runtime:Runtime}' --output json
```

Repita as consultas direcionadas com os nomes prod quando necessário. O usuário
`autokeep-deploy` consultado permite esses reads, mas não as listagens globais
ListTables/ListFunctions. São consultas; não criam recursos. Confira se a conta é a esperada. Um erro de
permissão deve ser registrado como limitação; não ampliar IAM automaticamente.
Evite despejar `env`, configurações completas de Lambda ou arquivos de secrets.

Os recursos AWS incluem tabelas `autokeep-dev`/`autokeep-prod` e funções
`autokeep-api-dev`/`autokeep-api-prod`. Em 18/11/2026, o Pulumi autenticado no
Codespace selecionou a stack `prod` e concluiu a atualização #10 com 4 recursos
criados e 36 inalterados. O site `https://autokeep.negoci.online` foi aberto.
Para consultar as stacks atuais:

```sh
cd pulumi-start-aws
pulumi whoami
pulumi stack ls
```

Registre o backend e as stacks encontradas, sem publicar tokens ou exportações
com secrets. O programa adota recursos AWS existentes e gerencia também a
hospedagem da produção. Consulte [o guia Pulumi](../pulumi-start-aws/README.md).
Iniciar a aplicação local continua sem executar `pulumi up`.

## Validação

```sh
npm test
npm run test:integration
npm run build
npm run build:lambda
```

A integração usa outro DynamoDB Local descartável e recusa endpoints remotos.
O site público foi carregado e a atualização Pulumi da stack prod foi concluída.
Login, operações de escrita/leitura e isolamento no ambiente AWS ainda precisam
de teste funcional. O registro histórico de inspeção do Codespace está em
[codespaces-validation.md](codespaces-validation.md); ele descreve o estado em
17/11/2026, antes da atualização de produção.

## Custos e publicação

O Compose local não cria nem usa recursos AWS. A hospedagem de produção usa a
infraestrutura AWS descrita no guia Pulumi e pode gerar cobranças por uso; os
créditos não são limite rígido. Alterar código/configuração local não publica
a aplicação cloud. Antes de adicionar qualquer serviço, estimar e aprovar o
custo e a frequência da cobrança.

O domínio próprio `autokeep.negoci.online` já está configurado na hospedagem
AWS. Para desenvolvimento, as portas 8080/8025 do Codespace usam seus hostnames
encaminhados e não precisam de Route 53 ou ACM.

Referências oficiais:

- [Variáveis padrão](https://docs.github.com/en/codespaces/developing-in-a-codespace/default-environment-variables-for-your-codespace)
- [Portas encaminhadas](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace)
- [Secrets do Codespaces](https://docs.github.com/en/codespaces/managing-your-codespaces/managing-your-account-specific-secrets-for-github-codespaces)

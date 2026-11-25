# API AutoKeep com AWS SAM local

O SAM emula o API Gateway e executa a Lambda de `lambda/index.ts` no Docker.
O Compose do SAM usa a tabela `autokeep-sam` em uma instância separada do
DynamoDB Local. A interface web continua disponível com `npm run dev`.

## Iniciar

Requisitos: Node.js 22.12+, AWS SAM CLI e Docker Desktop em modo Linux.
Os comandos usam as portas locais 3000 (API) e 8000 (DynamoDB). Rode na raiz:

```powershell
npm ci
npm run sam:validate
npm run sam:build
npm run sam:db
npm run sam:local
```

O primeiro build e a primeira requisição podem baixar imagens. Os scripts
usam credenciais fictícias para o banco local. O template é para execução
local. A infraestrutura publicada é gerenciada pelo Pulumi.

## Verificar

Em outro terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
npm run sam:test
npm run sam:test:integration
```

O primeiro comando deve retornar `status: ok`. Os testes verificam saúde,
sessão, autorização, isolamento entre organizações e gravações na tabela
local. A suíte de integração cria dados de teste exclusivos para cada execução.

Pare o servidor SAM com **Ctrl+C** e rode `npm run sam:down` para parar o
DynamoDB do SAM. O volume local preserva os dados.

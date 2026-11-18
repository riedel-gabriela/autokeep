# Pendências e tarefas por sprint — AutoKeep

Data de organização: 16/11/2026. Sprint 1 revisada documentalmente nesta data;
implantação e testes funcionais continuam sujeitos às tarefas seguintes.

## Base e limites da análise

- Código analisado: commit `ac69017` (`feat: publish persistent autokeep app`).
- Quadro da disciplina consultado em 11/11/2026: <https://github.com/users/ederson-torresini/projects/6/views/1>.
- No quadro consultado, as sprints 1 a 4 estavam encerradas; as sprints 5 e 6 estavam abertas. Isso representa o andamento da disciplina e não comprova a conclusão das entregas do AutoKeep.
- A análise considera o código e a documentação. As contas AWS e Vercel não foram acessadas para validar os recursos publicados.
- As issues têm descrições curtas. Onde não há critérios detalhados, as tarefas são uma proposta de conclusão técnica a confirmar com o professor.
- Uma caixa desmarcada representa trabalho de implementação, validação ou confirmação ainda necessário. Não significa necessariamente ausência de código.

## Resumo

| Sprint | Prazo do quadro consultado | Situação identificada no AutoKeep |
| --- | --- | --- |
| 1 — Especificação e diagramas | 17/09/2026 | Documentação revisada; aceite das mudanças de escopo a confirmar |
| 2 — IaC, Pulumi e DNS | 01/10/2026 | Stacks e bancos provisionados em 18/11; domínio e DNS pendentes |
| 3 — SAM, Lambda e banco | 22/10/2026 | Código parcial; SAM e publicação Lambda pendentes; banco precisa de validação |
| 4 — CDN, API Gateway e HTTPS | 05/11/2026 | Componentes AWS precisam de implementação e comprovação |
| 5 — Frontend, autenticação e e-mail | 19/11/2026 | Frontend e login presentes; validação publicada e envio de e-mail pendentes |
| 6 — Testes e CI/CD | 03/12/2026 | Suíte de testes e automação precisam ser implementadas ou comprovadas |

## Sprint 1 — Especificação e diagramas

Referência: <https://github.com/ederson-torresini/isn20262/milestone/3>.

### Situação

A documentação existe, mas parte descreve a arquitetura anterior. O ambiente local atual usa Docker e MySQL; o README descreve a publicação com Vercel e DynamoDB.

### Tarefas

- [x] **S1-01 — Atualizar o diagrama de blocos:** ambientes separados em [architecture.md](architecture.md).
- [x] **S1-02 — Documentar a arquitetura de entrega na AWS:** alvo planejado e limites em [architecture.md](architecture.md).
- [x] **S1-03 — Revisar requisitos e regras de negócio:** matriz de implementação e decisões de escopo em [requisitos.md](requisitos.md).
- [x] **S1-04 — Atualizar casos de uso, fluxogramas e contrato da API:** [casos-de-uso.md](casos-de-uso.md), [fluxogramas.md](fluxogramas.md), [openapi.yaml](openapi.yaml) e [contratos-api.md](contratos-api.md).

Conclusão documental não equivale a aceite do professor ou testes de execução.
OAuth, OBD2, push e a escolha de hospedagem continuam com escopo a confirmar.

### Critério de conclusão

Documentação e código descrevem o mesmo funcionamento. As diferenças entre ambiente local, publicação atual e arquitetura planejada estão explícitas.

## Sprint 2 — Ambiente IaC, Pulumi e DNS

Referência: <https://github.com/ederson-torresini/isn20262/milestone/4>.

### Situação

A pasta oficial `infra/` define DynamoDB e DNS por ambiente, com testes sem nuvem.
AWS CLI e Pulumi CLI foram instalados em 16/11/2026. Em 18/11/2026 foram
autenticadas as contas, registradas as stacks e criadas as tabelas dev/prod,
conforme [evidências](infraestrutura-provisionada.md). O DNS está desativado até
haver domínio autorizado. `pulumi-start-aws` é somente exemplo histórico de bucket.

### Tarefas

- [x] **S2-01 — Preparar as ferramentas:** AWS CLI 2.40.2 e Pulumi CLI 3.276.0 instalados e versões verificadas; autenticação fica em S2-02.
- [x] **S2-02 — Configurar autenticação:** perfil AWS e organização Pulumi confirmados em 18/11/2026.
- [x] **S2-03 — Implementar o projeto Pulumi:** `infra/` define dados e DNS para sprint 2; Lambda/CDN/certificados pertencem às sprints seguintes. TypeScript e testes locais validam a definição; deploy não executado.
- [x] **S2-04 — Registrar as stacks `dev` e `prod`:** stacks e tabelas distintas criadas; mesmo perfil/conta utilizados, sem roles separadas para cada ambiente nesta etapa.
- [x] **S2-05 — Verificar DynamoDB existente:** consulta não encontrou tabelas na conta/região selecionadas; foram criadas tabelas novas. Não houve importação nem migração do banco usado pela Vercel.
- [ ] **S2-06 — Configurar domínio ou subdomínio via IaC:** confirmar se será fornecido pelo professor ou gerenciado pelo projeto.
- [ ] **S2-07 — Criar registros DNS:** apontar os endereços dos ambientes para os respectivos serviços.
- [x] **S2-08 — Documentar configuração e execução:** guia em [infra/README.md](../infra/README.md) e script `scripts/configure-infra.ps1`. Preview real depende de S2-02, S2-04 e domínio autorizado.

### Critério de conclusão

Stacks registradas no backend escolhido, infraestrutura gerenciada pelo Pulumi e DNS funcionando. Os recursos existentes estão associados corretamente ao gerenciamento da infraestrutura.

## Sprint 3 — SAM, Lambda e banco de dados

Referência: <https://github.com/ederson-torresini/isn20262/milestone/5>.

### Situação

Existe implementação da API e geração do pacote Lambda. O README informa que a Lambda ainda não foi criada. O ambiente local com Docker/MySQL existe, mas não substitui a preparação de Lambda e banco com SAM solicitada na sprint.

### Tarefas

- [x] **S3-01 — Adicionar template e configuração SAM:** `template.yaml`, compilação esbuild e guia [sam-local.md](sam-local.md); validação e build SAM aprovados em 18/11/2026.
- [x] **S3-02 — Preparar dados e eventos de teste locais:** fixtures isoladas ADMIN/DRIVER e de outra organização, evento de saúde e suíte `sam:test:integration`; 19 cenários aprovados em 18/11/2026. Seed de demonstração continua desativado; testes preparam suas próprias contas.
- [x] **S3-03 — Definir o banco usado pelos testes SAM:** DynamoDB em Compose separado, tabela autokeep-local com pk/sk e credenciais fictícias; conexão pela Lambda local confirmada em 18/11/2026.
- [x] **S3-04 — Publicar a API em Lambda:** autokeep-dev-api publicada e Active; runtime, handler, variáveis, memória e timeout confirmados. Escopo desta entrega: dev, sem API em prod.
- [x] **S3-05 — Configurar a role da Lambda:** política limitada à tabela autokeep-dev e logs próprios; simulação IAM confirmou negação em autokeep-prod.
- [ ] **S3-06 — Validar o DynamoDB publicado:** conferir tabela, chaves, permissões e isolamento de ambientes.
- [ ] **S3-07 — Demonstrar persistência:** cadastrar, consultar e alterar dados pela API publicada.
- [x] **S3-08 — Registrar evidências:** parte local em [testes-api-local.md](testes-api-local.md) e publicação, chamadas HTTP e instruções de logs em [api-dev-publicada.md](api-dev-publicada.md). Fluxos de negócio com gravação na AWS permanecem em S3-07.

### Critério de conclusão

Lambda executável localmente e publicada na AWS, realizando operações reais no banco. Está definido quais recursos são gerenciados por SAM e quais por Pulumi, evitando gerenciamento duplicado.

## Sprint 4 — CDN, API Gateway, HTTPS e integração

Referência: <https://github.com/ederson-torresini/isn20262/milestone/6>.

### Situação

A publicação documentada usa Vercel. Essa configuração, isoladamente, não comprova os componentes AWS pedidos na sprint.

### Tarefas

- [x] **S4-01 — Criar o API Gateway:** HTTP API dev com rota proxy /api/{proxy+} publicada.
- [x] **S4-02 — Integrar API Gateway e Lambda:** integração payload 2.0 e permissão restrita; chamadas reais de saúde e autenticação negativa aprovadas em dev.
- [ ] **S4-03 — Integrar o frontend à API AWS:** garantir que o site utilize o backend escolhido para a entrega.
- [ ] **S4-04 — Configurar a CDN:** definir origem e regras de cache; respostas autenticadas não devem ser compartilhadas entre usuários.
- [ ] **S4-05 — Configurar certificado HTTPS:** emitir e validar o certificado e associá-lo ao domínio.
- [ ] **S4-06 — Ajustar cookies e acesso entre origens:** verificar login e sessões na arquitetura publicada.
- [ ] **S4-07 — Validar o fluxo completo:** domínio, frontend, API Gateway, Lambda e DynamoDB funcionando em conjunto.

### Critério de conclusão

Aplicação acessível por HTTPS, com CDN e API integrada à Lambda. Chamadas autenticadas funcionam no navegador e preservam o isolamento dos usuários.

## Sprint 5 — Frontend, hospedagem, autenticação e e-mail

Referência: <https://github.com/ederson-torresini/isn20262/milestone/7>.

### Situação

Frontend e login já existem. O Mailpit captura mensagens somente no ambiente local. O README informa que convites publicados retornam um link e não enviam e-mail.

### Tarefas

- [ ] **S5-01 — Validar frontend publicado:** testar navegação, responsividade e mensagens de erro.
- [ ] **S5-02 — Testar os perfis:** administrador, motorista e garagem pessoal.
- [ ] **S5-03 — Testar isolamento:** impedir acesso a veículos e organizações de outros usuários.
- [ ] **S5-04 — Validar sessões:** login, logout, expiração e acesso sem autenticação.
- [ ] **S5-05 — Integrar envio real de e-mails:** substituir o transporte exclusivamente local pelo provedor escolhido.
- [ ] **S5-06 — Configurar remetente e credenciais:** verificar identidade/domínio e permissões de envio.
- [ ] **S5-07 — Testar convites por e-mail:** envio, recebimento, aceitação, expiração e reutilização do token.
- [ ] **S5-08 — Confirmar o requisito “autenticação e e-mail”:** esclarecer se exige confirmação de cadastro ou recuperação de senha e implementar o fluxo exigido.

### Critério de conclusão

Interface hospedada, autenticação validada e fluxo de e-mail exigido funcionando fora do Docker. Cognito/OAuth deve ser tratado como decisão de arquitetura ou requisito confirmado; sua adoção não é presumida apenas pelo título da entrega.

## Sprint 6 — Testes, integração e deploy contínuos

Referência: <https://github.com/ederson-torresini/isn20262/milestone/10>.

### Situação

Não foram encontrados suíte de testes nem workflow de CI na versão analisada. A configuração de publicação automática da Vercel pode existir fora do repositório e precisa ser verificada.

### Tarefas

- [ ] **S6-01 — Configurar ferramenta e comando de testes:** disponibilizar execução reproduzível pelo terminal.
- [ ] **S6-02 — Criar testes unitários:** cobrir regras de manutenção, limites por tempo/quilometragem, médias e validações.
- [ ] **S6-03 — Criar testes de integração:** cobrir login, autorização, veículos, convites e persistência.
- [ ] **S6-04 — Isolar dados de teste:** impedir que testes alterem produção.
- [ ] **S6-05 — Criar workflow de CI:** instalar dependências, verificar tipos, executar testes e compilar em pull requests e pushes.
- [ ] **S6-06 — Configurar deploy contínuo:** publicar no ambiente correto após as validações.
- [ ] **S6-07 — Configurar credenciais da automação:** guardar segredos fora do repositório e limitar permissões.
- [ ] **S6-08 — Validar o deploy automaticamente:** verificar saúde da API e acesso ao frontend.
- [ ] **S6-09 — Documentar recuperação:** explicar como voltar a uma versão funcional.

### Critério de conclusão

Uma alteração passa por testes automáticos e chega ao ambiente publicado por um processo verificável. Há evidências da execução da pipeline, da publicação e da verificação de saúde.

## Pendências adicionais da especificação do AutoKeep

Os itens abaixo constam como pendentes ou sem medição na documentação do projeto. Seu vínculo obrigatório com uma sprint precisa ser confirmado, pois não aparece explicitamente nos títulos das entregas.

- [ ] **EX-01 — Integrar hardware OBD2 real:** implementar e validar comunicação com adaptador/veículo, diferenciando odômetro total de outros valores disponíveis.
- [ ] **EX-02 — Implementar notificações push remotas:** configurar provedor, inscrições e credenciais.
- [ ] **EX-03 — Publicar o avaliador periódico de alertas:** executar o processamento agendado na nuvem e validar idempotência e entrega.
- [ ] **EX-04 — Confirmar OAuth externo:** implementar caso permaneça obrigatório na especificação acordada.
- [ ] **EX-05 — Medir desempenho:** verificar a meta de resposta abaixo de 200 ms, definindo cenário, carga e métrica utilizados.

## Ordem sugerida e dependências

1. Definir e documentar a arquitetura final (**S1-01 a S1-04**).
2. Preparar ferramentas, autenticação e infraestrutura Pulumi (**S2-01 a S2-05**).
3. Preparar SAM e publicar Lambda/banco (**S3-01 a S3-08**).
4. Concluir DNS, API Gateway, CDN e HTTPS (**S2-06 a S2-08**, **S4-01 a S4-07**).
5. Validar frontend/autenticação e concluir e-mails (**S5-01 a S5-08**).
6. Concluir testes e CI/CD (**S6-01 a S6-09**).
7. Executar os itens adicionais cujo escopo tenha sido confirmado (**EX-01 a EX-05**).

Os testes devem ser desenvolvidos junto das implementações. A lista acima indica dependências gerais; não exige adiar testes até a última etapa.

## Evidências para acompanhar a entrega

Ao concluir uma tarefa, marcar a caixa e registrar a evidência correspondente: commit, arquivo, resultado de teste, execução da pipeline, chamada HTTP ou captura do recurso publicado. Não incluir senhas, tokens ou chaves.

| Tarefa | Evidência ou referência | Data de validação |
| --- | --- | --- |
| S1-01 e S1-02 | architecture.md: blocos locais, publicação documentada e alvo AWS separado | 16/11/2026 — revisão documental |
| S1-03 | requisitos.md: RF/RNF, regras, fontes e mudanças de escopo | 16/11/2026 — revisão documental |
| S1-04 | casos-de-uso.md, fluxogramas.md, contratos-api.md e OpenAPI; 22 operações comparadas com cada backend | 16/11/2026 — comparação estrutural |
| S2-01 | AWS CLI 2.40.2 e Pulumi CLI 3.276.0: comandos de versão executados com sucesso | 16/11/2026 |
| S2-03 | `npm run check --prefix infra` e `npm test --prefix infra`: compilação sem erros e três testes locais aprovados | 16/11/2026 — mocks, sem nuvem |
| S2-08 | infra/README.md; script PowerShell com sintaxe validada e execução simulada, incluindo bloqueio de conta incorreta | 16/11/2026 — sem autenticação real |
| S3-01 e S3-03 | SAM CLI 1.173.0: validate --lint e build; npm run sam:test confirmou health 200, sessão ausente 401 e origem inválida 403 no Docker | 18/11/2026 — teste local real |
| S3-02 | `npm run sam:test:integration`: 19 cenários, zero falhas; correção do cadastro indevido por DRIVER e build TypeScript/frontend aprovados | 18/11/2026 — SAM/DynamoDB local |

Verificados links locais dos documentos centrais, fechamento de blocos Markdown,
referências internas de componentes OpenAPI e correspondência dos métodos/caminhos
com ambas as APIs. Não houve execução funcional, validação por parser OpenAPI,
renderização visual dos diagramas ou consulta a contas externas nesta revisão.

Em 18/11/2026, quatro testes locais e a verificação TypeScript passaram. Preview
e up reais foram concluídos nas duas stacks; ambas as tabelas estão ACTIVE.
Aplicação e delegação DNS continuam pendentes de domínio autorizado. Não houve
alteração do site Vercel. Detalhes em [infraestrutura-provisionada.md](infraestrutura-provisionada.md).

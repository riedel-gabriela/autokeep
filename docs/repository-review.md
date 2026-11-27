# Revisão do repositório e infraestrutura

Data: 26/11/2026. Branch: refactor/personal-garage.

## Correções aplicadas

- Removido ExternalLink, sem chamadas, e a opção de tom dos indicadores, sem
  consumidores. Removidas 16 regras CSS comprovadamente sem uso; preservadas
  classes geradas dinamicamente, como status warning/due.
- Corrigida a descrição HTML que ainda mencionava frota.
- Removidos o alias de comando deve, o evento SAM sem consumidor, a pasta api
  inexistente do escopo TypeScript e exceções de arquivos abandonados do gitignore.
- Habilitadas verificações TypeScript de variáveis e parâmetros sem uso no build.
- Corrigido make lambda para gerar o frontend antes do pacote Lambda.
- Substituídos o PDF e cinco diagramas estáticos antigos por data-model.md,
  com relações, chaves DynamoDB, sequência e regras atuais em texto/Mermaid.
  Os artefatos substituídos continuam recuperáveis pelo histórico Git.
- Atualizados changelog, README e matriz de requisitos com o resultado real
  das validações e limites conhecidos. O escopo de notificações e CD foi
  atualizado posteriormente em milestone-audit.md.
- Atualizado o estudo GPS para aplicativos mobile iPhone/Android; sem implementação.
- Reinstaladas dependências pelo lockfile, eliminando pacotes extraneous do
  node_modules local. Nenhuma dependência declarada remanescente foi identificada
  como sem uso; esbuild é necessário para o SAM, mesmo sem import no código.

## Verificação

- npm test: 12 aprovados. O sandbox inicialmente bloqueou portas locais;
  execução com permissão de rede local passou integralmente.
- npm run test:integration: aprovado com DynamoDB Local descartável, tanto
  para origem localhost quanto Codespaces.
- Build TypeScript/Vite, pacote Lambda e check TypeScript do Pulumi executados.
- Links relativos da documentação e git diff --check conferidos.
- Inventário AWS e previews ao vivo registrados em aws-review.md.

Essas verificações detectam referências e regressões cobertas pelas suítes;
não constituem prova absoluta de ausência de todo código morto ou de falhas.
Não houve uma nova sessão de OAuth Google nem execução SAM nesta revisão.

## Mantidos por uso ou compatibilidade

- Todas as imagens de public são usadas pelo HTML, interface, manifest ou push.
- SAM, fixtures de integração e esbuild pertencem ao cenário local documentado.
- organizationId, vínculos e ADMIN são usados para autorização da garagem
  pessoal e compatibilidade com dados existentes; não são gestão de frota ativa.
- Dados legados, histórico e auditoria não foram apagados.
- Dev e prod têm recursos separados; não são duplicação acidental.

## Pendências e limites

- Push substituiu e-mail no escopo informado pelo responsável. A ativação do
  CD e as evidências de push constam em milestone-audit.md.
- Entrega de push em aparelho real, responsividade, latência e SAM ainda
  precisam de evidências específicas.
- Escritas de manutenção em múltiplos itens precisam de revisão de concorrência
  antes de adicionar ingestão GPS automática; não foram alteradas nesta limpeza.
- O provider Pulumi avisa sobre dois tipos S3 depreciados. A migração deve ser
  planejada com aliases e preview sem substituir o bucket.
- A consulta das políticas do usuário de deploy foi negada; não declarar IAM
  totalmente auditado. Inventário regional limitado a us-east-1.

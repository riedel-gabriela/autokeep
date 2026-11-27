# Changelog

## Não lançado — branch refactor/personal-garage

### Alterações

- Simplificada a aplicação para garagem pessoal, preservando veículos,
  leituras, óleo, previsões, notificações, histórico e auditoria.
- Produção autentica exclusivamente com Google OAuth; desenvolvimento oferece
  botão Entrar com conta pessoal de teste, sem senha.
- Removidos gestão de frota, convites, atribuição de motoristas, Mailpit e
  hospedagem Vercel. DynamoDB Local atende Docker e Codespaces.
- Publicados frontend e API da AWS dev pela Function URL existente; produção
  mantém S3 privado, CloudFront, API Gateway e domínio com HTTPS.
- Alinhadas as duas stacks Pulumi, removidas a Function URL legada de produção,
  suas permissões públicas e variáveis antigas de demonstração.
- Corrigidos o encaminhamento privado do Codespace e a diferença recorrente
  de configuração da origem S3 no CloudFront.
- Revisados componentes e estilos sem uso, metadados, comandos e documentação;
  substituídos PDF/diagramas antigos por modelagem editável do sistema atual.
- Documentado o estudo mobile de GPS para iPhone e Android; sem implementação.

### Validação

A revisão funcional está em [codespaces-validation.md](docs/codespaces-validation.md).
Pendências de entrega e limites permanecem em
[milestone-audit.md](docs/milestone-audit.md).

## 0.1.0 — 2026-10-15

- Protótipo local original com perfis de gestor e motorista, posteriormente
  substituído pela garagem pessoal. Consulte o histórico Git para essa versão.

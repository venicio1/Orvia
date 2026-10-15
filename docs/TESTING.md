# Testes e validações

## Fundação

- `pnpm typecheck`: contratos TypeScript em web e API.
- `pnpm lint`: regras estáticas em cada app.
- `pnpm test`: testes unitários/API e testes de componentes essenciais da interface.
- `pnpm build`: build de produção de ambos os apps.
- `pnpm check`: sequência completa.
- Verificação manual no navegador: navegação, layout responsivo, teclado/foco, carregamento e estado de API indisponível.

O health check deve retornar resposta JSON real da API; a rota proxy deve converter indisponibilidade em erro HTTP e o frontend deve oferecer nova tentativa. Se não houver datasets, cada seção mostra ausência de dados sem itens fictícios.

## Identidade e perfil (Fase 1A)

- Unitários para hash de senha, tokens de uso único, limites e regras de autorização do perfil.
- Integração PostgreSQL para persistência, consumo único, revogação de sessão e isolamento entre usuários.
- Fluxos críticos: cadastro e confirmação, login/logout, redefinição de senha, salvamento parcial e retomada do onboarding, edição do perfil e acesso sem sessão.
- CSRF/origens, cookies, sessão expirada, tentativas limitadas e validação estrita de entrada.
- Integração local de e-mail somente via Mailpit; não enviar mensagens de teste a provedor externo.

### Integração PostgreSQL opcional

A rotina padrão `pnpm check` não depende de PostgreSQL nem altera dados locais. Por isso, os três testes de `apps/api/test/identity.integration.spec.ts` são ignorados por padrão por meio de `describe.skipIf(process.env.RUN_DB_INTEGRATION !== "1")`:

1. `persists profiles and sessions independently for two users` — persistência e isolamento de perfil/sessão.
2. `allows only one account when normalized duplicate registrations race` — corrida de cadastros com e-mail normalizado.
3. `reissues one confirmation token, rejects expired links, and consumes a valid link once` — reenvio, expiração e consumo único de tokens.

Esses casos dependem de PostgreSQL e Mailpit locais, criam dados temporários e limpam as contas de teste ao final, por isso não rodam na rotina padrão. Execute-os explicitamente quando os serviços locais estiverem disponíveis:

```powershell
$env:RUN_DB_INTEGRATION = "1"
pnpm --filter @orvia/api test -- identity.integration.spec.ts
```

O teste usa endereços aleatórios `@orvia-test.local` e remove seus usuários ao final. O teste E2E local `pnpm --filter @orvia/api exec tsx test/auth-flow.e2e.ts` também requer API/web, PostgreSQL e Mailpit ativos; ele cria e remove contas temporárias e deixa as mensagens de teste no Mailpit.

### Pendência manual de produção

A Fase 1A está aprovada para desenvolvimento local, mas ainda falta validar manualmente no navegador o ciclo completo de recuperação/redefinição de senha, inclusive o uso único do link. Essa pendência não impede a continuidade do desenvolvimento local; deve ser concluída antes da aprovação para produção. Também permanecem pendentes os requisitos de produção listados em `docs/ROADMAP.md` e `docs/SECURITY.md`.

Funcionalidades posteriores deverão testar filas, fuso/horário de verão, idempotência, limites externos, respostas inválidas da IA e fontes sem evidência.

## Conexão Meta (primeira entrega Fase 1C)

- `apps/api/test/social-integrations.spec.ts`: configuração ausente, scopes mínimos, state associado à sessão, recusa de state não confiável, troca mockada de authorization code, checagem de permissões, conexão idempotente por chave composta, descoberta alternativa por ID com token cifrado, recusa de campos públicos sem Page Access Token, isolamento de usuário/sessão, replay de state, persistência do histórico e desconexão escopada ao usuário.
- `apps/api/test/social-token-crypto.spec.ts`: round-trip AES-256-GCM, IV aleatório, adulteração, chave errada e comprimento inválido.
- `apps/web/src/components/meta-connection-panel.test.tsx`: estado não configurado sem botão falso, estado autorizado, mensagem de callback e ação de desconexão pela UI.
- Esses unit tests usam respostas mockadas somente no ambiente de teste e não indicam conexão real. A UI não usa fixtures para preencher contas.
- `apps/api/test/social-integrations.integration.spec.ts` é opcional (requer `RUN_DB_INTEGRATION=1`) e valida transação, cifragem, descoberta alternativa por ID, histórico, isolamento de desconexão e apagamento de token em PostgreSQL real. Foi executado com PostgreSQL local ativo.
- Migrações `20261015203000_meta_social_connections`, `20261015204500_diagnostic_fk_constraint_name`, `20261015210000_social_account_owner_constraint`, `20261015211000_oauth_session_owner_constraint` e `20261016100000_meta_page_id_discovery` estão aplicadas no PostgreSQL local. A última acrescenta campos de descoberta temporária cifrada e controle de tentativas; nenhuma remove dados.
- Em 2026-10-15, o proprietário confirmou manualmente um OAuth real no navegador: `@unicstreetbr`, Página `Orvia Testes`, status conectado e escopos esperados. `/me/accounts` veio vazio e a conexão foi completada pelo fallback por ID. A API foi consultada novamente no banco e pelo serviço de status, sem selecionar/exibir o token.
- Testes com Meta real não devem registrar tokens, authorization codes, query completa ou resposta bruta. Não usar produção nem contas de pacientes. Conectar somente conta profissional de teste controlada. Essa confirmação não valida métricas, Insights, Business Discovery ou hashtags, que continuam fora da Fase 1C.

## Diagnóstico profissional e estratégia inicial (Fase 1B)

- Unitários puros em `apps/api/test/diagnostic.engine.spec.ts`: fórmula/dimensões, versionamento do critério, ausência de dados externos inventados, campos desconhecidos, limite de três prioridades, zero e baixa disponibilidade e salvaguardas gerais.
- Integração PostgreSQL em `apps/api/test/diagnostics.integration.spec.ts`: repetição concorrente/idempotência, histórico após alteração e isolamento entre proprietários. Executar junto com as demais integrações usando `RUN_DB_INTEGRATION=1` e PostgreSQL local.
- Fluxo `apps/api/test/auth-flow.e2e.ts`: sessão/CSRF obrigatórios, diagnóstico de perfil parcial, geração concorrente, navegação autenticada, histórico, isolamento, versão nova após alteração relevante e tentativa de leitura cruzada. Requer Web, API e PostgreSQL locais; usa e-mails fictícios aleatórios e os remove ao final.
- Testes da interface em `apps/web/src/components/diagnostic-workspace.test.tsx`: vazio, carregamento/erro/retentativa, falha ao persistir, explicabilidade, recomendação, feedback de sucesso, semântica do medidor e marcação de revisão. `pnpm check` inclui unitários, lint, tipos e builds.
- Responsividade verificada por regras CSS para breakpoints de tablet/celular e markup semântico. A captura manual foi feita no desktop; viewport móvel real ainda precisa de validação manual.
- Validação manual no navegador continua recomendada para leitura em viewport móvel, teclado, contraste e fluxo visual completo. A auditoria exploratória final da Fase 1B não deve ser substituída por sucesso de build.

Não considerar uma funcionalidade concluída por existir uma página. Registrar comandos, resultados e limitações por entrega.

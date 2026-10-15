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

Não considerar uma funcionalidade concluída por existir uma página. Registrar comandos, resultados e limitações por entrega.

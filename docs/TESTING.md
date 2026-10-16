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
- `apps/api/test/instagram-profile.spec.ts`: consulta real Graph v26.0 via adaptador testado com fixture, Page token somente no cabeçalho, campos ausentes/nulos/zero, isolamento, limite/concorrência, erro com preservação do snapshot e recusa de ID divergente. Fixtures são exclusivamente para testes e não provam acesso real da Meta.
- `apps/web/src/components/meta-connection-panel.test.tsx`: cartão de perfil, fonte/versão/data e disparo da leitura inicial independente do callback OAuth.
- `apps/api/test/social-integrations.integration.spec.ts`: snapshot PostgreSQL, FK composta de proprietário, valores nulos/zero e exclusão do snapshot ao desconectar. Execute com `RUN_DB_INTEGRATION=1` e PostgreSQL local; a integração Meta em si permanece controlada separadamente.
- Esses unit tests usam respostas mockadas somente no ambiente de teste e não indicam conexão real. A UI não usa fixtures para preencher contas.
- `apps/api/test/social-integrations.integration.spec.ts` é opcional (requer `RUN_DB_INTEGRATION=1`) e valida transação, cifragem, descoberta alternativa por ID, histórico, isolamento de desconexão e apagamento de token em PostgreSQL real. Foi executado com PostgreSQL local ativo.
- Migrações `20261015203000_meta_social_connections`, `20261015204500_diagnostic_fk_constraint_name`, `20261015210000_social_account_owner_constraint`, `20261015211000_oauth_session_owner_constraint` e `20261016100000_meta_page_id_discovery` estão aplicadas no PostgreSQL local. A última acrescenta campos de descoberta temporária cifrada e controle de tentativas; nenhuma remove dados.
- Em 2026-10-15, o proprietário confirmou manualmente um OAuth real no navegador: `@unicstreetbr`, Página `Orvia Testes`, status conectado e escopos esperados. `/me/accounts` veio vazio e a conexão foi completada pelo fallback por ID. A API foi consultada novamente no banco e pelo serviço de status, sem selecionar/exibir o token.
- Testes com Meta real não devem registrar tokens, authorization codes, query completa ou resposta bruta. Não usar produção nem contas de pacientes. Conectar somente conta profissional de teste controlada. Essa confirmação não valida métricas, Insights, Business Discovery ou hashtags, que continuam fora da Fase 1C.

### Leitura de perfil Instagram (Fase 1D.1)

- O Graph API é consultado somente pelo backend, usando o Page Access Token cifrado. O teste local real verifica conta autorizada, resposta e timestamp sem imprimir credenciais ou payload completo.
- A primeira sincronização é disparada depois do retorno OAuth, por requisição independente da tela autenticada. Uma falha de perfil não desfaz a conexão.
- `InstagramProfileSnapshot` guarda somente o snapshot mais recente e os campos efetivamente retornados; `SocialSyncRun` guarda resultado e categoria de erro. Falha conserva o snapshot válido anterior.
- Atualização manual requer sessão, CSRF e origem correta, usa trava/intervalo por conta e não agenda polling nesta fase.
- Validação real local em 2026-10-15 pela conexão já autorizada `@unicstreetbr`: a Graph API v26.0 retornou os oito campos solicitados (`username`, `name`, `biography`, `profile_picture_url`, `followers_count`, `follows_count`, `media_count`, `website`). Nenhum valor do perfil ou credencial foi impresso no log de validação; o snapshot foi persistido com fonte e timestamp. Uma atualização manual subsequente pela interface também retornou sucesso.

### Publicações Instagram (Fase 1D.2)

- `apps/api/test/instagram-media.spec.ts`: suportes IMAGE/VIDEO/CAROUSEL_ALBUM e filhos; campos opcionais rejeitados individualmente; resposta vazia; paginação parcial/cursor; repetição do mesmo ID; preservação em erro; invalidação de URL; ausência de token em query/resultado; isolamento e controle de concorrência.
- `apps/web/src/components/instagram-publications.test.tsx`: primeira leitura separa `media_count` do resultado real de `/media`; visitas posteriores carregam a cópia persistida sem sincronizar novamente; vazio não é fabricado em falha; ausência de conexão dá caminho para configurações.
- `apps/api/test/social-integrations.integration.spec.ts`: persiste publicações e assets em PostgreSQL; verifica FK/isolamento de proprietário, desconexão e limpeza dos dados de mídia e disputa concorrente de sync (somente uma chamada externa).
- As integrações de PostgreSQL são opcionais e são executadas com `RUN_DB_INTEGRATION=1` e serviços locais ativos. Rodar `pnpm --filter @orvia/api test -- instagram-media.spec.ts` e `pnpm --filter @orvia/web test -- instagram-publications.test.tsx` para as suítes específicas; rodar `RUN_DB_INTEGRATION=1 pnpm --filter @orvia/api test -- social-integrations.integration.spec.ts` em PowerShell para a integração do módulo.
- Verificação real local em 15/10/2026 no horário local (timestamp UTC de 16/10) com o Page Access Token já cifrado da conta conectada correspondente a `@unicstreetbr`: chamada oficial Graph API v26.0 à aresta `/media` terminou com sucesso, leu 2 registros, guardou 2 publicações (ambas `CAROUSEL_ALBUM`, com 4 filhos `IMAGE`), uma página e sem cursor restante. A Meta não rejeitou nenhum campo solicitado. Os campos presentes nas respostas dos registros foram `id`, `caption`, `timestamp`, `permalink`, `media_type`, `media_url` e `media_product_type`; `thumbnail_url` foi solicitado, mas não veio no payload. Para os filhos, vieram `id`, `media_type` e `media_url`; `thumbnail_url` não veio. Não foram impressos IDs, legendas, URLs de mídia, tokens nem payloads. No snapshot de perfil disponível naquele momento, `media_count` também constava como 2.
- Isso difere da observação anterior de 0 publicações feita pelo proprietário; o estado real atual da Graph API e do snapshot utilizado nesta execução retornou 2. A tela exibe somente as publicações efetivamente consultadas. Não se conclui vazio com base somente em `media_count`.
- Não são coletados Insights. Test fixtures não são renderizadas no ambiente real. A interface foi validada no navegador local em `http://localhost:3000/publicacoes` com sessão existente e aprovada pelo proprietário.
- Validação final em 15/10/2026: `pnpm check` passou (Prisma, TypeScript, ESLint, 47 testes API aprovados/6 ignorados, 34 testes Web aprovados e build); `RUN_DB_INTEGRATION=1 pnpm --filter @orvia/api test -- social-integrations.integration.spec.ts` passou (1/1); `prisma migrate status` reportou 11 migrações encontradas e schema atualizado; `git diff --check` sem erros. Um teste de identidade excedeu o timeout durante uma execução concorrente; passou isoladamente (8/8) e a rotina completa repetida passou.
- Revisão no navegador com viewports 1440×900, 768×1024, 390×844 e 320×740: sem overflow horizontal, conteúdo fora da área ou mídia distorcida. Setas e teclado foram confirmados no navegador; eventos de swipe touch foram exercitados por teste automatizado de ponteiro, sem teste em dispositivo físico.

## Diagnóstico profissional e estratégia inicial (Fase 1B)

- Unitários puros em `apps/api/test/diagnostic.engine.spec.ts`: fórmula/dimensões, versionamento do critério, ausência de dados externos inventados, campos desconhecidos, limite de três prioridades, zero e baixa disponibilidade e salvaguardas gerais.
- Integração PostgreSQL em `apps/api/test/diagnostics.integration.spec.ts`: repetição concorrente/idempotência, histórico após alteração e isolamento entre proprietários. Executar junto com as demais integrações usando `RUN_DB_INTEGRATION=1` e PostgreSQL local.
- Fluxo `apps/api/test/auth-flow.e2e.ts`: sessão/CSRF obrigatórios, diagnóstico de perfil parcial, geração concorrente, navegação autenticada, histórico, isolamento, versão nova após alteração relevante e tentativa de leitura cruzada. Requer Web, API e PostgreSQL locais; usa e-mails fictícios aleatórios e os remove ao final.
- Testes da interface em `apps/web/src/components/diagnostic-workspace.test.tsx`: vazio, carregamento/erro/retentativa, falha ao persistir, explicabilidade, recomendação, feedback de sucesso, semântica do medidor e marcação de revisão. `pnpm check` inclui unitários, lint, tipos e builds.
- Responsividade verificada por regras CSS para breakpoints de tablet/celular e markup semântico. A captura manual foi feita no desktop; viewport móvel real ainda precisa de validação manual.
- Validação manual no navegador continua recomendada para leitura em viewport móvel, teclado, contraste e fluxo visual completo. A auditoria exploratória final da Fase 1B não deve ser substituída por sucesso de build.

Não considerar uma funcionalidade concluída por existir uma página. Registrar comandos, resultados e limitações por entrega.

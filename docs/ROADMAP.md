# Roadmap

## Fase 0 — Fundação e decisões (concluída)

- pnpm workspace e estrutura `apps/web`, `apps/api`, `packages/*`.
- Shell visual premium e responsivo, navegação base e estados reais loading/erro/vazio.
- API NestJS com health check consultado de verdade pelo frontend.
- Compose local opcional para PostgreSQL/Redis e schema Prisma inicial (sem fluxo de persistência de produto).
- Documentação de produto, arquitetura, dados, fontes, roadmap, decisões, segurança, testes e AGENTS.
- Lint, tipos, teste e build.

**Conclusão:** instalação reproduzível, `pnpm dev` abre web/API, health check responde, erro da API fica visível quando indisponível, áreas sem registros mostram estado vazio, schema Prisma valida e Compose é válido, verificações passam. Nenhum dado ou integração simulada.

## Fase 1 — MVP funcional

### Fase 1A — Identidade, autenticação e perfil profissional (concluída para desenvolvimento local)

- Cadastro, confirmação de e-mail, login/logout, recuperação/redefinição de senha, cookies HttpOnly, CSRF e limites de tentativa.
- Perfil profissional e onboarding progressivo, salvamento parcial e edição posterior.
- API privada com isolamento por usuário; dashboard lê perfil real e mantém vazios nas áreas ainda não entregues.
- Persistência PostgreSQL/Prisma via migração versionada, com e-mail local pelo Mailpit.

**Status:** aprovada para continuidade do desenvolvimento local. Cadastro, confirmação, login/logout, recuperação/redefinição, sessões, onboarding progressivo, perfil, dashboard e persistência PostgreSQL/Prisma estão implementados. Os testes automatizados, integração local com PostgreSQL/Mailpit e auditorias exploratórias realizadas passaram conforme registrados em `docs/TESTING.md`.

**Pendências antes de considerar pronta para produção:** completar manualmente no navegador o ciclo de recuperação e redefinição de senha, incluindo a tentativa de reutilizar o link; escolher/configurar SMTP de produção com TLS, remetente e domínio verificados; provisionar segredos fora do repositório; definir hospedagem, HTTPS, proxy confiável e migrações de deploy; preparar backup/restauração e monitoramento; concluir as revisões operacionais e de privacidade aplicáveis. O Mailpit continua sendo somente local.

### Fase 1B — Diagnóstico profissional e estratégia inicial (autorizada em 2026-10-15)

**Escopo desta autorização:** diagnóstico determinístico, explicável e baseado somente no perfil profissional autodeclarado; estratégia inicial compatível com a disponibilidade; histórico versionado; interface autenticada; testes e persistência. Integrações externas não fazem parte desta autorização.

1. Resumo com pontos de partida, oportunidades, limitações e campos ausentes.
2. Pontuação limitada ao preenchimento/organização das informações, com dimensões, método e versão dos critérios explícitos.
3. Até três prioridades, ações iniciais, justificativa, esforço estimado, indicadores simples e salvaguardas gerais de comunicação profissional.
4. Snapshot do perfil, resultado, versão dos critérios, estratégia, estado e revisão persistidos no PostgreSQL, com isolamento por usuário e geração idempotente.
5. Interface responsiva e acessível com estados reais de carregamento, erro, vazio, sucesso e histórico.

**Status:** concluída e aprovada para continuidade do desenvolvimento local em 2026-10-15. Migration aplicada; testes unitários, integração PostgreSQL, fluxo E2E, `pnpm check`, isolamento e validação do fluxo no navegador executados. Desktop e celular foram conferidos visualmente. A conferência visual completa em tablet continua pendente porque a captura nessa viewport apresentou duplicação da página; as medições no navegador indicaram que não há rolagem horizontal. Essa pendência não bloqueia as próximas fases e deve ser revisitada antes da publicação de produção. A pontuação não representa desempenho, qualidade profissional, procura, alcance nem probabilidade de crescimento. Campos ausentes não são tratados como fatos negativos.

**Fora da Fase 1B:** inteligência de mercado/fontes externas, sincronização de métricas ou conteúdo social, mentor/IA, jornadas/desafios, planejamento completo de conteúdo, análise de conversão/resultados, revisão semanal/relatórios e outras fases. A Fase 1C abaixo cobre somente a fundação de autorização Meta; não altera diagnóstico nem coleta dados clínicos de pacientes.

### Fase 1C — Fundação de conexão Meta (concluída para desenvolvimento local)

**Escopo desta entrega:** estrutura isolada `social-integrations`; conexão oficial por OAuth Facebook Login somente leitura; estados real/configurado/não configurado; state OAuth curto, vinculado a usuário/sessão e de uso único; descoberta de contas profissionais associadas a Pages do usuário; persistência Prisma/PostgreSQL de conexão, token cifrado e histórico de execução; desconexão com apagamento do token; UI em Configurações; testes automatizados e documentação para App Review.

**Não incluído:** sincronização de publicações/Insights, Business Discovery, hashtag search, fontes de notícias/pesquisa/tendências, recomendações de mercado, scraping, IA, publicação ou demais módulos posteriores.

**Permissões solicitadas quando habilitada:** `pages_show_list`, `instagram_basic`, `pages_read_engagement`. `instagram_manage_insights` ficará para uma entrega que realmente consulte Insights. Business Discovery/hashtags e requisitos de Advanced Access/App Review precisam ser confirmados no painel Meta antes de serem adicionados.

**Estado desta entrega:** concluída para desenvolvimento local em 2026-10-15. `pnpm check`, testes PostgreSQL e migrações foram validados. O proprietário concluiu um OAuth real e confirmou no Orvia a conta profissional `@unicstreetbr`, Página `Orvia Testes`, status conectada e escopos `pages_show_list`, `instagram_basic`, `pages_read_engagement`. Nesta conta, `/me/accounts` retornou vazio; o fallback oficial por ID de Página consultou a Graph API com o token OAuth da sessão, recebeu Page Access Token e Instagram vinculado, e a conexão foi persistida. Nenhum token foi compartilhado ou impresso nesta verificação.

**Pendências antes de produção e de fases de coleta:** App Review/Advanced Access e Business Verification conforme requisitos vigentes; política de privacidade e exclusão aplicável à conexão; operação de segredos, backups e deploy; estratégia de reautorização quando Meta invalidar ou revogar tokens. Insights, Business Discovery, hashtag search, fontes de mercado e IA permanecem fora desta fase e exigem revisão técnica e autorização próprias.

## Fase 2 — Consolidação

Calendário completo, analytics avançado, relatórios mensais, notificações, administração minimizada e planos/limites. Cobranças reais dependem de autorização explícita.

## Fase 3 — Expansão

Clínicas, novos canais, agendamento, WhatsApp e geração de mídia/automação, cada qual com avaliação de consentimento, segurança, custo e termos.

## Portões de qualidade

Typecheck, lint, testes pertinentes, build, revisão de acessibilidade, isolamento, ausência de segredos nos logs, documentação atualizada e distinção clara entre dados reais e indisponíveis.

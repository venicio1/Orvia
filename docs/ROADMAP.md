# Roadmap

## Fase 0 — Fundação e decisões (escopo autorizado atual)

- pnpm workspace e estrutura `apps/web`, `apps/api`, `packages/*`.
- Shell visual premium e responsivo, navegação base e estados reais loading/erro/vazio.
- API NestJS com health check consultado de verdade pelo frontend.
- Compose local opcional para PostgreSQL/Redis e schema Prisma inicial (sem fluxo de persistência de produto).
- Documentação de produto, arquitetura, dados, fontes, roadmap, decisões, segurança, testes e AGENTS.
- Lint, tipos, teste e build.

**Conclusão:** instalação reproduzível, `pnpm dev` abre web/API, health check responde, erro da API fica visível quando indisponível, áreas sem registros mostram estado vazio, schema Prisma valida e Compose é válido, verificações passam. Nenhum dado ou integração simulada.

## Fase 1 — MVP funcional (requer autorização separada)

1. Identidade, sessão, recuperação e isolamento multiusuário.
2. Perfil profissional e onboarding parcial/editável.
3. Diagnóstico explicável e metodologia versionada.
4. Fontes de mercado verificadas, observações, evidências e oportunidades.
5. Estratégias versionadas e aprováveis; desafios e progresso.
6. Mentor com provedor configurado, contexto estruturado, validação e limites.
7. Métricas manuais e/ou integração Meta após aprovação e elegibilidade.
8. Retrospectiva semanal assíncrona, idempotente, com feedback e aprovação humana.

Cada fluxo requer testes unitários, integração e autorização por usuário; integração externa só se considera entregue quando testada com permissões válidas.

## Fase 2 — Consolidação

Calendário completo, analytics avançado, relatórios mensais, notificações, administração minimizada e planos/limites. Cobranças reais dependem de autorização explícita.

## Fase 3 — Expansão

Clínicas, novos canais, agendamento, WhatsApp e geração de mídia/automação, cada qual com avaliação de consentimento, segurança, custo e termos.

## Portões de qualidade

Typecheck, lint, testes pertinentes, build, revisão de acessibilidade, isolamento, ausência de segredos nos logs, documentação atualizada e distinção clara entre dados reais e indisponíveis.

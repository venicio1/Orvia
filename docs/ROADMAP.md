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

A Fase 1B (diagnóstico e crescimento) não foi iniciada e exige autorização separada.

### Fase 1B — Diagnóstico e crescimento (fora do escopo autorizado atual)

1. Diagnóstico explicável e metodologia versionada.
2. Fontes de mercado verificadas, observações, evidências e oportunidades.
3. Estratégias versionadas e aprováveis; desafios e progresso.
4. Mentor com provedor configurado, contexto estruturado, validação e limites.
5. Métricas manuais e/ou integração Meta após aprovação e elegibilidade.
6. Retrospectiva semanal assíncrona, idempotente, com feedback e aprovação humana.

Cada fluxo requer testes unitários, integração e autorização por usuário; integração externa só se considera entregue quando testada com permissões válidas.

## Fase 2 — Consolidação

Calendário completo, analytics avançado, relatórios mensais, notificações, administração minimizada e planos/limites. Cobranças reais dependem de autorização explícita.

## Fase 3 — Expansão

Clínicas, novos canais, agendamento, WhatsApp e geração de mídia/automação, cada qual com avaliação de consentimento, segurança, custo e termos.

## Portões de qualidade

Typecheck, lint, testes pertinentes, build, revisão de acessibilidade, isolamento, ausência de segredos nos logs, documentação atualizada e distinção clara entre dados reais e indisponíveis.

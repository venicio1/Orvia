# Registro de decisões técnicas

## Aprovadas para a fundação

### D-001 — Monólito modular

**Decisão:** manter uma API NestJS modular e um frontend Next.js no mesmo monorepo. **Motivo:** fronteiras claras sem custo operacional de microsserviços antes de haver necessidade.

### D-002 — pnpm workspaces

**Decisão:** `pnpm-workspace.yaml` inclui `apps/*` e `packages/*`; versão do gerenciador registrada no projeto. **Motivo:** gerenciamento consistente de aplicações e pacotes compartilhados.

### D-003 — Prioridade da experiência web

**Decisão:** a Fase 0 inclui shell funcional navegável, com hierarquia visual, responsividade, acessibilidade e estados observáveis reais; não é apenas configuração técnica.

### D-004 — Proveniência antes de inteligência de mercado

**Decisão:** toda observação de mercado precisa de fonte identificável, método permitido, data e evidência; ausência de evidência é comunicada. Não utilizar scraping não autorizado nem inventar dados.

### D-005 — Sem integrações simuladas

**Decisão:** disponibilidade é determinada por checagens reais; ausência de integração/dados é explícita.

### D-006 — Sem commit/push automático

**Decisão:** alterações ficam para revisão do usuário; nenhum commit ou push sem pedido explícito.

### D-007 — Persistência local preparada, sem fluxo de produto na Fase 0

**Decisão:** fornecer Compose com PostgreSQL/Redis restritos ao loopback e Prisma 7 com schema inicial User/Profile. **Motivo:** deixar a infraestrutura pronta sem antecipar autenticação/onboarding, que pertencem à Fase 1. Credenciais padrão são exclusivamente locais.

## Pendentes

- Provedor de hospedagem/região e política de backup.
- Biblioteca/provedor de autenticação, SMTP/e-mail e regras de recuperação.
- Provedor/modelo de IA, retenção e orçamento por usuário.
- Fontes iniciais de tendência e responsável por aprovar catálogo/termos.
- Aplicativo Meta, permissões necessárias e processo de revisão.
- Política formal de retenção, exportação, exclusão e anonimização LGPD.
- Limites e planos comerciais, período de teste e provedor de pagamento.
- Identidade visual final (marca, tipografia e tokens aprovados).

Decisões pendentes não bloqueiam a fundação, mas bloqueiam a ativação dos respectivos módulos.

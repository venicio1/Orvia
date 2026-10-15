# Arquitetura

## Direção

Monorepo pnpm e monólito modular TypeScript. Web Next.js App Router; API REST NestJS; PostgreSQL/Prisma provisionáveis localmente desde a fundação; worker e Redis para trabalhos assíncronos na fase que exigir filas. Não introduzir microsserviços sem evidência operacional.

## Pacotes

- `apps/web`: páginas, componentes, acessibilidade e camada de apresentação.
- `apps/api`: módulos de domínio e endpoints. Atualmente só health check.
- `packages/*`: contratos, configuração ou UI compartilhados quando necessários.

## Módulos de domínio planejados

Identity; Professional Profile; Social Integrations; Diagnostics; Market Intelligence; Strategy; AI Mentor; Journeys & Challenges; Content Planning; Analytics & Conversion; Weekly Reviews & Monthly Reports; Notifications; Subscriptions; Administration; Audit & Security.

## Dependências

Identity → Profile → Diagnostics/Market Intelligence → Strategy → Challenges/Planning → Analytics/Weekly Reviews. Mentor consome contexto por interfaces explícitas desses módulos. Auditoria recebe eventos sanitizados; não controla domínio. Integrações ficam em adaptadores com contratos próprios, falhas normalizadas e limites observáveis.

## Interface e estados

A web deve privilegiar hierarquia visual, navegação compreensível, teclado, contraste, foco visível, movimento reduzido e layouts adaptáveis. Loading, erro e ausência de dados devem corresponder a condições reais. Integrações não configuradas aparecem como indisponíveis, não conectadas.

## Execução local

`pnpm dev` inicia web (3000) e API (4000). `/api/health` no Next encaminha para o endpoint real da API definido em `API_INTERNAL_URL`; indisponibilidade é exibida na UI. PostgreSQL e Redis iniciam opcionalmente por `pnpm infra:up`; a Fase 0 ainda não consulta esses serviços.

## Decisões de fundação

Ver [DECISIONS.md](DECISIONS.md). O esquema de dados conceitual está em [DATABASE.md](DATABASE.md).

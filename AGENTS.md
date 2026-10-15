# Instruções do projeto Orvia

## Escopo atual

A Fase 1A autorizada inclui identidade, autenticação, sessão, perfil profissional e onboarding progressivo/editável. Não iniciar diagnóstico, pesquisa de mercado, integrações sociais, mentor, desafios, planejamento ou qualquer funcionalidade posterior sem autorização explícita.

## Comandos

- Instalar: `pnpm install`
- Iniciar web + API: `pnpm dev`
- Iniciar só web: `pnpm dev:web`
- Iniciar só API: `pnpm dev:api`
- Subir PostgreSQL/Redis/Mailpit: `pnpm infra:up`
- Abrir e-mails locais: `http://localhost:8025`
- Aplicar migrações pendentes: `pnpm db:migrate`
- Qualidade: `pnpm check` (typecheck, lint, testes e build)

## Estrutura

- `apps/web`: Next.js App Router, interface e API proxy somente para health check.
- `apps/api`: NestJS, endpoints REST e módulos de domínio futuros.
- `packages/*`: contratos/configurações compartilháveis quando houver consumidor real.
- `docs`: decisões, arquitetura, fontes, segurança e critérios por fase.

## Convenções

- Manter português brasileiro na interface e acessibilidade semântica.
- Preservar fronteiras modulares; regras de negócio não devem depender de framework de UI.
- Não apresentar dados, integrações ou tendências simulados como reais. Toda evidência de mercado deve ter fonte, data, método de acesso e limitações.
- Nenhuma coleta via scraping sem autorização explícita do titular/fonte e compatibilidade com os termos aplicáveis.
- Não armazenar dados clínicos identificáveis de pacientes.
- Configurações e segredos vêm de variáveis de ambiente; nunca os registrar em logs ou commitar.
- Testar regras e fluxos relevantes à mudança; executar typecheck, lint, testes e build antes de declarar a etapa concluída.
- Não fazer commit ou push sem pedido explícito.

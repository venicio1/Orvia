# Instruções do projeto Orvia

## Escopo atual

A Fase 1A está concluída para desenvolvimento local. A Fase 1B foi autorizada para implementação nesta etapa, limitada a diagnóstico profissional determinístico e explicável e estratégia inicial baseada exclusivamente no perfil profissional autodeclarado.

Não implementar nesta autorização inteligência de mercado, tendências externas, redes sociais, mentor/IA, desafios/jornadas, planejamento de conteúdo, analytics, conversões, relatórios, integrações externas ou outras fases. Diagnósticos não podem afirmar desempenho ou dados externos sem fonte real; separar declaração, inferência, recomendação e dado ausente. Preservar versões e isolamento por usuário. Não armazenar dados clínicos de pacientes. Não fazer commit/push sem pedido explícito.

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

- `apps/web`: Next.js App Router, interface e API proxy same-origin.
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

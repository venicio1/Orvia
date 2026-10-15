# Orvia

Fundação de uma plataforma SaaS de inteligência de mercado e crescimento orgânico para profissionais da saúde. A Fase 0 oferece a estrutura visual inicial, navegação, estados de interface reais e uma API de saúde; não inclui ainda onboarding, dados de mercado, IA ou integrações sociais.

## Requisitos

- Node.js `>=22.22.3` e pnpm `11.25.0` (ou compatível com `packageManager`).
- Docker Desktop com Compose, caso queira iniciar PostgreSQL e Redis locais. Eles não são necessários para abrir a interface da Fase 0.

## Executar localmente

```powershell
pnpm install
pnpm dev
```

Abra [http://localhost:3000](http://localhost:3000). O frontend encaminha o health check para `API_INTERNAL_URL` (padrão `http://localhost:4000`). Se a API não estiver disponível, a interface mostra erro real e opção de tentar novamente.

Para iniciar os serviços de dados locais (opcional nesta fase):

```powershell
Copy-Item apps/api/.env.example apps/api/.env
pnpm infra:up
pnpm db:generate
pnpm db:migrate
```

PostgreSQL e Redis ficam vinculados somente ao loopback. As credenciais do Compose são exclusivas para desenvolvimento local. O app ainda não lê nem grava dados nesses serviços na Fase 0.
Para personalizar o destino da API no frontend, copie `apps/web/.env.example` para `apps/web/.env.local`.

Para executar isoladamente: `pnpm dev:web` ou `pnpm dev:api`. A API fica em `http://localhost:4000/health`.

## Validações

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

`pnpm check` executa as quatro verificações em sequência. Detalhes em [docs/TESTING.md](docs/TESTING.md).

## Documentação

- [Produto e escopo](docs/PRODUCT.md)
- [Arquitetura](docs/ARCHITECTURE.md)
- [Dados](docs/DATABASE.md)
- [Fontes e integrações](docs/INTEGRATIONS.md)
- [Roadmap](docs/ROADMAP.md)
- [Decisões técnicas](docs/DECISIONS.md)
- [Segurança](docs/SECURITY.md)
- [Testes](docs/TESTING.md)
- [Convenções para agentes](AGENTS.md)

## Estado da fundação

Nenhum dado de usuário, métrica social ou tendência é inventado. A interface apresenta áreas vazias até que módulos com fontes verificadas sejam implementados. A conexão com Meta, IA, e-mail e pagamentos não está ativa nesta fase.

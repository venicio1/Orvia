# Orvia

Plataforma SaaS de crescimento profissional para profissionais da saúde. A Fase 1A inclui identidade, autenticação, perfil profissional e onboarding progressivo. Diagnóstico, dados de mercado, IA e integrações sociais seguem fora do escopo.

## Requisitos

- Node.js `>=22.22.3` e pnpm `11.25.0` (ou compatível com `packageManager`).
- Docker Desktop com Compose para PostgreSQL, Redis e Mailpit locais.

## Executar localmente

```powershell
pnpm infra:up
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env.local
pnpm db:generate
pnpm db:migrate
pnpm install
pnpm dev
```

Abra [http://localhost:3000](http://localhost:3000). Crie uma conta, confirme o endereço em [Mailpit](http://localhost:8025), entre e complete o onboarding. Mensagens locais não saem da máquina. O Mailpit usa SMTP em `127.0.0.1:1025`.

Para atualizar o banco com migrações futuras:

```powershell
pnpm db:migrate
```

PostgreSQL, Redis e Mailpit ficam vinculados somente ao loopback. `.env` e `.env.local` contêm valores locais ignorados pelo Git. Em produção, configure SMTP autenticado com TLS e remetente verificado; consulte [docs/SECURITY.md](docs/SECURITY.md).

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

Dados de mercado, métricas e funcionalidades posteriores não são simulados. O e-mail ativo nesta fase é apenas o serviço local Mailpit para confirmação e recuperação de acesso.

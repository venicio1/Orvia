# Arquitetura

## Direção

Monorepo pnpm e monólito modular TypeScript. Web Next.js App Router; API REST NestJS; PostgreSQL/Prisma provisionáveis localmente desde a fundação; worker e Redis para trabalhos assíncronos na fase que exigir filas. Não introduzir microsserviços sem evidência operacional.

## Pacotes

- `apps/web`: páginas, componentes, acessibilidade, proxy same-origin para API e camada de apresentação.
- `apps/api`: módulos de domínio e endpoints REST. Identity e perfil concentram autenticação, sessão e autorização no backend.
- `packages/*`: contratos, configuração ou UI compartilhados quando necessários.

## Módulos de domínio planejados

Identity; Professional Profile; Social Integrations; Diagnostics; Market Intelligence; Strategy; AI Mentor; Journeys & Challenges; Content Planning; Analytics & Conversion; Weekly Reviews & Monthly Reports; Notifications; Subscriptions; Administration; Audit & Security.

## Dependências

Identity → Profile → Diagnostics/Market Intelligence → Strategy → Challenges/Planning → Analytics/Weekly Reviews. Mentor consome contexto por interfaces explícitas desses módulos. Auditoria recebe eventos sanitizados; não controla domínio. Integrações ficam em adaptadores com contratos próprios, falhas normalizadas e limites observáveis.

## Interface e estados

A web deve privilegiar hierarquia visual, navegação compreensível, teclado, contraste, foco visível, movimento reduzido e layouts adaptáveis. Loading, erro e ausência de dados devem corresponder a condições reais. Integrações não configuradas aparecem como indisponíveis, não conectadas.

## Execução local

`pnpm dev` inicia web (3000) e API (4000). `/api/*` no Next encaminha para o endpoint real da API definido em `API_INTERNAL_URL`. PostgreSQL, Redis e Mailpit iniciam por `pnpm infra:up`.

O navegador usa o proxy same-origin `/api/*`, que encaminha cookies e respostas da API sem expor o segredo da sessão ao JavaScript. NestJS mantém autoridade sobre sessão, validação, autorização e propriedade dos dados; Next consulta `/auth/me` no servidor para proteger páginas privadas. Fluxo: controller → serviço de identidade/perfil → Prisma/PostgreSQL. E-mail transacional usa SMTP configurável; o Mailpit recebe mensagens locais sem encaminhamento externo. Limites de autenticação usam operações atômicas no PostgreSQL; Redis fica disponível para futuras filas.

A API liga-se ao loopback por padrão (`API_HOST=127.0.0.1`). Produção deve colocá-la em rede privada atrás do Next e configurar `TRUST_PROXY_HOPS` conforme a topologia; a borda confiável deve substituir `X-Forwarded-For` antes do encaminhamento. Isso mantém limites por IP corretos sem confiar em cabeçalhos fornecidos diretamente por clientes.

## Decisões de fundação

Ver [DECISIONS.md](DECISIONS.md). O esquema de dados conceitual está em [DATABASE.md](DATABASE.md).

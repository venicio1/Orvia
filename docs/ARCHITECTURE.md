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

Identity → Profile → Diagnostics → Initial Strategy → Social Integrations (conexão autorizada apenas) → (future, separately authorized) Market Intelligence/Planning/Analytics. O motor do diagnóstico da Fase 1B é uma função de domínio determinística, sem dependência do framework web ou APIs externas. Recebe um snapshot tipado do perfil e retorna achados estruturados e estratégia. Uma versão de critérios identifica as regras. Coleta de mercado, sincronização de conteúdo, mentor/IA, desafios e planejamento completo permanecem separados.

### Primeira entrega Meta (conexão apenas)

`social-integrations` é módulo isolado NestJS; a web acessa status, início, resolução de ID de Página e desconexão pelo proxy same-origin. OAuth authorization-code, state ligado à sessão, troca de código e consultas à Meta ficam somente no backend. Se `/me/accounts` vier vazio, um ID informado pelo usuário é validado sob o token da sessão; o ID não prova autorização, e a API exige o Page Access Token e Instagram vinculado na resposta Meta. PostgreSQL persiste conta, escopos concedidos, state, ciphertext temporário com expiração e execuções de conexão/sincronização. Tokens são cifrados AES-256-GCM; nenhuma credencial entra no diagnóstico Fase 1B. A primeira entrega não importa posts/insights nem consulta fontes de mercado.

Permissões iniciais mínimas: `pages_show_list`, `instagram_basic`, `pages_read_engagement`. Insights (`instagram_manage_insights`), Business Discovery e hashtags são recursos futuros, condicionados à verificação no painel Meta e aprovação de acesso necessária. A versão Graph API é configuração explícita; conectar depende de App ID/Secret, URI autorizado e chave de cifragem válidos. Configuração ausente resulta em estado indisponível real.

## Interface e estados

A web deve privilegiar hierarquia visual, navegação compreensível, teclado, contraste, foco visível, movimento reduzido e layouts adaptáveis. Loading, erro e ausência de dados devem corresponder a condições reais. Integrações não configuradas aparecem como indisponíveis, não conectadas.

## Execução local

`pnpm dev` inicia web (3000) e API (4000). `/api/*` no Next encaminha para o endpoint real da API definido em `API_INTERNAL_URL`. PostgreSQL, Redis e Mailpit iniciam por `pnpm infra:up`.

O navegador usa o proxy same-origin `/api/*`, que encaminha cookies e respostas da API sem expor o segredo da sessão ao JavaScript. NestJS mantém autoridade sobre sessão, validação, autorização e propriedade dos dados; Next consulta `/auth/me` no servidor para proteger páginas privadas. Fluxo: controller → serviço de domínio → Prisma/PostgreSQL. E-mail transacional usa SMTP configurável; o Mailpit recebe mensagens locais sem encaminhamento externo. Limites de autenticação usam operações atômicas no PostgreSQL; Redis fica disponível para futuras filas.

O módulo `diagnostics` autentica pela sessão, aplica CSRF e origem nas mutações, lê o perfil por `userId` da sessão e persiste snapshot, resultado e estratégia. Um advisory transaction lock por usuário serializa geração concorrente. Solicitações repetidas com perfil e critérios inalterados retornam a versão atual; alteração dos campos relevantes cria nova versão e preserva a anterior. Chave estrangeira composta exige que diagnóstico e estratégia tenham o mesmo proprietário.

A API liga-se ao loopback por padrão (`API_HOST=127.0.0.1`). Produção deve colocá-la em rede privada atrás do Next e configurar `TRUST_PROXY_HOPS` conforme a topologia; a borda confiável deve substituir `X-Forwarded-For` antes do encaminhamento. Isso mantém limites por IP corretos sem confiar em cabeçalhos fornecidos diretamente por clientes.

## Decisões de fundação

Ver [DECISIONS.md](DECISIONS.md). O esquema de dados conceitual está em [DATABASE.md](DATABASE.md).

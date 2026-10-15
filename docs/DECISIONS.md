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
- Provedor SMTP de produção, domínio/remetente e política de recuperação de produção.
- Provedor/modelo de IA, retenção e orçamento por usuário.
- Fontes iniciais de tendência e responsável por aprovar catálogo/termos.
- Aplicativo Meta, permissões necessárias e processo de revisão.
- Política formal de retenção, exportação, exclusão e anonimização LGPD.
- Limites e planos comerciais, período de teste e provedor de pagamento.
- Identidade visual final (marca, tipografia e tokens aprovados).

Decisões pendentes não bloqueiam a fundação, mas bloqueiam a ativação dos respectivos módulos.

## Fase 1A

### D-008 — Sessão própria na API NestJS

**Decisão:** sessão opaca de 256 bits, somente hash SHA-256 em PostgreSQL, validade de sete dias e cookie HttpOnly/SameSite=Lax; Next encaminha pelo proxy same-origin. **Motivo:** manter autorização na API planejada sem expor token bearer ao JavaScript. CSRF combina origem estrita e double-submit vinculado à sessão.

### D-009 — Derivação de senha com scrypt do Node

**Decisão:** `node:crypto` scrypt com N=2^17, r=8, p=1, salt aleatório de 128 bits e comparação de tempo constante. **Motivo:** KDF resistente a força bruta sem dependência nativa ou script de instalação, compatível com Windows.

### D-010 — Mailpit local e SMTP em produção

**Decisão:** Nodemailer envia confirmação/reset ao Mailpit local; produção requer SMTP TLS autenticado e remetente verificado. **Motivo:** testar os fluxos sem transmitir e-mail nem credenciais para serviço externo. Nenhum provedor de produção foi escolhido.

### D-011 — Limitação atômica no PostgreSQL

**Decisão:** contadores SQL atômicos por hash de IP/e-mail. **Motivo:** persistir limites entre reinícios e permitir múltiplas instâncias sem exigir Redis nesta fase.

### D-012 — API local e proxy confiável

**Decisão:** API liga-se ao loopback local; em produção, só fica acessível pela rede privada e `TRUST_PROXY_HOPS` é configurado para os proxies reais. **Motivo:** usar IP encaminhado para limites sem confiar em cabeçalhos arbitrários de clientes.

### D-013 — Cadastro normalizado e tokens de confirmação serializados

**Decisão:** normalizar e-mail para lowercase, preservar unicidade no PostgreSQL e responder ao cadastro com texto uniforme. Cada conta mantém no máximo um token por finalidade; reenvio substitui o anterior sob advisory lock transacional, e a confirmação consome o token atomicamente com a alteração do estado verificado. A política de senha vale para criação/reset, não para autenticação. **Motivo:** impedir duplicação concorrente, reduzir enumeração e tornar reenvios/consumo previsíveis sem aceitar confirmação duplicada.

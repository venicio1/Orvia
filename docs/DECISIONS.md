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

## Fase 1B

### D-014 — Diagnóstico inicial determinístico

**Decisão:** calcular por função de domínio pura, a partir apenas de campos profissionais autodeclarados. Exibir método, dimensões, evidências, limitações e ausências. Critérios atuais usam `orvia-diagnostico-1.1.0`: Fundamentos dá 25 pontos por profissão, especialidade, região e presença de público-alvo; Direção dá 0/50/100 para zero/um/dois ou mais objetivos; Rotina dá 50 pontos por experiência e frequência informadas; Disponibilidade dá 100 quando informada (inclusive zero), 0 quando ausente. A pontuação final é a média simples das quatro dimensões arredondada ao inteiro. A pontuação representa preenchimento/organização das informações, não qualidade, desempenho, procura ou previsão. **Motivo:** resultado reproduzível e sem alegar acesso a redes ou mercado.

### D-015 — Snapshot e histórico versionado

**Decisão:** persistir snapshot, resultado e estratégia associados em tabelas versionadas. Advisory lock transacional por usuário torna pedidos repetidos idempotentes; mudanças relevantes criam versão e preservam anteriores. **Motivo:** explicar cada resultado após mudanças e evitar duplicatas por clique concorrente.

### D-016 — Plano inicial limitado pela disponibilidade

**Decisão:** recomendar até três prioridades; ajustar esforço ao tempo informado. Zero horas não agenda execução e tempo desconhecido pede preenchimento antes de planejar tarefas. Incluir salvaguardas gerais, sem afirmar interpretação legal específica. **Motivo:** reduzir pressão, incompatibilidade de esforço e orientação regulatória sem contexto suficiente.

## Fase 1C — conexão Meta

### D-017 — Conexão inicial via Facebook Login, leitura mínima

**Decisão:** a fundação Meta usa OAuth Facebook Login por ser o caminho oficial alinhado à futura avaliação de Business Discovery/hashtags. A primeira entrega pede somente `pages_show_list`, `instagram_basic`, `pages_read_engagement`, enumera contas profissionais vinculadas a Pages acessíveis e permite desconectar. Se `/me/accounts` vier vazio, aceita um ID de Página como seletor, mas só conecta após a Graph API autenticada devolver o Page Access Token e Instagram vinculado; não solicita tokens manuais nem `business_management`. Não solicita `instagram_manage_insights` antes de implementar leitura de Insights, nem publicação, comentários, mensagens, anúncios ou permissões amplas de negócio. **Motivo:** testar identidade e vínculo da conta com menor privilégio e sem afirmar acesso a funcionalidades ainda não aprovadas. Um teste real foi confirmado em 2026-10-15 pelo fallback por ID.

### D-018 — OAuth no backend e credenciais cifradas

**Decisão:** authorization-code com `state` aleatório persistido somente como hash, vinculado à sessão e usuário, TTL 10 minutos, consumo único; token exchange e chamadas Graph só no backend; tokens de Page armazenados com AES-256-GCM e chave de 32 bytes separada do App Secret; desconexão apaga ciphertext e escopos. Sem configuração completa, integração é indisponível e não faz chamadas externas. **Motivo:** reduzir CSRF, replay e exposição de credenciais no frontend/logs.

### D-019 — Recursos condicionais à revisão da Meta

**Decisão:** Insights, Business Discovery e hashtag search são fases posteriores, condicionadas à documentação da versão, access level, permissões e decisões atuais do painel/App Review. **Motivo:** a documentação descreve capacidades de plataforma, mas não prova que o aplicativo Orvia recebeu autorização para usá-las.

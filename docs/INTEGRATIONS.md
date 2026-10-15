# Integrações e proveniência de mercado

## Regra de entrada de fonte

Nenhuma tendência, perfil de referência ou oportunidade é exibido como fato sem uma fonte identificável e verificável. Antes de ativar uma fonte, registrar e revisar:

1. Identidade do publicador e URL/API oficial.
2. Método permitido de acesso e termos/licença aplicáveis.
3. Dados e métricas efetivamente disponibilizados, escopos e limites.
4. Data/hora de observação e frequência de atualização.
5. Evidência consultável, atribuição exigida e prazo de retenção.
6. Limitações, cobertura e nível de confiança; responsável pela revisão.

Fontes devem ser aprovadas em catálogo versionado. Revalidar termos e disponibilidade periodicamente e antes de ampliar coleta. Preferir APIs oficiais, datasets/licenças explícitos e conteúdo informado manualmente pelo usuário. Não fazer scraping, contornar autenticação/limites, nem inferir dados privados de terceiros. Se autorização ou evidência faltar, não apresentar a informação como descoberta.

## Modelo de observação

Cada tendência/oportunidade deve guardar `source_id`, URL ou ID da fonte, título/tema, trecho ou metadado estritamente necessário, método de aquisição, instante de coleta, janela temporal, atribuição, justificativa, limitações e confiança. Separar evidência observada da síntese gerada por IA. A IA não cria fontes; toda alegação precisa apontar para evidência armazenada. Evidência insuficiente resulta em estado “dados insuficientes”, não em alegação de lacuna.

## Instagram / Meta

Integração exclusivamente por fluxo oficial Meta e contas/permissões elegíveis. A primeira entrega de Meta implementa somente conexão/autorização, descoberta de contas profissionais vinculadas a Páginas acessíveis, estado da conexão e desconexão. Não sincroniza publicações, insights, hashtags ou perfis de referência.

### Caminho escolhido para a primeira entrega

Priorizar Instagram API with Facebook Login porque a futura pesquisa de conteúdo público/Business Discovery está documentada nesse caminho. Ele exige conta Instagram Business/Creator vinculada a uma Facebook Page acessível ao usuário. Instagram Login não exige Página vinculada, mas não é o caminho que a documentação consultada da coleção Meta usa para os exemplos de Business Discovery e hashtag.

Para conexão/descoberta inicial, a configuração Facebook Login for Business deve incluir somente `pages_show_list`, `instagram_basic` e `pages_read_engagement`, necessárias à enumeração de Páginas e localização de uma conta profissional associada. `instagram_manage_insights` não substitui esses escopos e não é usada nesta entrega, que ainda não lê Insights. Ela deve ser adicionada apenas quando o recurso de Insights estiver implementado e for necessário. Não pedir publicação, comentários, mensagens, anúncios ou permissões amplas de negócio.

Permissões e capacidades são condicionadas ao aplicativo, versão da Graph API, modo de desenvolvimento/produção, papel do usuário na aplicação e acessos efetivamente aprovados. A coleção oficial da Meta indica que o caminho Facebook Login pode acessar mídia por hashtags e metadados/métricas básicos de outros perfis profissionais, mas isso não equivale a Insights privados nem autoriza pesquisa irrestrita. Business Discovery deverá consultar contas conhecidas/permitidas segundo o endpoint; a descoberta automática de profissionais semelhantes fica bloqueada até a revisão do endpoint, escopos e limites no painel real.

### OAuth implementado

1. Usuário autenticado inicia por `POST /integrations/meta/connect`; API exige origem web estrita e CSRF.
2. API cria estado aleatório de 256 bits com hash no PostgreSQL, vinculado a `userId` e `sessionId`, com validade de dez minutos e consumo atômico único.
3. Navegador redireciona para o diálogo oficial do Facebook Login for Business com URI de retorno exata, `response_type=code` e `config_id`; as permissões vêm da configuração Meta e o app não envia parâmetro `scope`.
4. Callback passa pelo proxy same-origin `/api/integrations/meta/callback`. A API exige sessão original, valida/consome o estado e troca o código no servidor.
5. API confere permissões efetivamente concedidas e tenta descobrir Pages por `/me/accounts`. Se `data` vier vazio, o usuário pode informar um ID de Página; a API consulta `/{page-id}` usando o token OAuth do usuário, e só considera autorização comprovada se a Meta retornar o mesmo Page ID, um Page Access Token e o Instagram profissional vinculado. O token de usuário fica cifrado, vinculado à mesma sessão, por no máximo dez minutos, com limite de tentativas; não há entrada de tokens pelo cliente. A API armazena tokens de Page cifrados com AES-256-GCM. A versão do Graph é configurada explicitamente; não se presume uma versão “mais recente”. Se a resposta não informar validade do token de Page, `tokenExpiresAt` fica desconhecido (nulo); a validade do user token não é atribuída falsamente ao token de Page.
6. UI mostra apenas contas/escopos autorizados e permite desconectar do Orvia. Desconexão apaga ciphertext e escopos, mantendo histórico operacional sem credencial. A autorização do aplicativo concedida à Meta permanece sob controle da conta Meta; o usuário é instruído a remover o acesso nos controles de aplicativos/integrações da Meta se quiser revogação externa também.

As falhas de descoberta são classificadas sem persistir payloads ou tokens da Meta: `no_accessible_pages` é registrada para o resultado primário vazio; a UI então oferece o fallback por ID. `pages_without_instagram_account` representa Página validada sem `instagram_business_account.id`; `page_not_authorized` indica que a consulta da Página não comprovou acesso suficiente; `required_scope_missing`/`insufficient_permissions` cobre permissões; `graph_*` cobre falhas da API. `recordsRead` guarda somente contagens. O proxy same-origin passa redirects OAuth ao navegador sem segui-los no servidor, preservando o contexto dos cookies.

O Graph `/me/accounts` pode retornar mais de uma Página/conta profissional. A UI informa antes da autorização que todas as contas elegíveis retornadas serão conectadas; o usuário pode remover individualmente as que não deseja manter. A aplicação não seleciona silenciosamente uma conta arbitrária.

Nunca registrar OAuth `code`, estado, tokens, App Secret, chaves ou URLs de token exchange. O callback retorna imediatamente à página de configurações com um resultado enumerado e cabeçalhos `no-store`/`no-referrer`. Reautorização é necessária se permissões forem revogadas ou se a Meta invalidar um token. Um token sem `tokenExpiresAt` conhecido não é tratado como permanentemente válido; chamadas de dados futuras devem lidar com revogação/expiração retornada pela API.

Variáveis são exclusivas do backend: `META_APP_ID`, `META_APP_SECRET`, `META_LOGIN_CONFIG_ID`, `META_GRAPH_API_VERSION`, `META_REDIRECT_URI` e `META_TOKEN_ENCRYPTION_KEY`. O OAuth é Facebook Login for Business: envia `config_id` e não `scope`; as permissões vêm da configuração no painel. O URI local deve ser exatamente `http://localhost:3000/api/integrations/meta/callback` quando `WEB_PUBLIC_URL=http://localhost:3000`. A chave é base64 de 32 bytes; não reutilizar App Secret como chave de cifragem. Segredos não devem estar em `NEXT_PUBLIC_*`, `.env.example`, frontend, Git ou logs.

### Permissões e acesso ainda pendentes

- App Review/Advanced Access para uso fora de pessoas com papel de desenvolvedor, administrador ou tester na app, conforme a classificação que o painel atribuir a cada permissão.
- Acesso de leitura a Insights da conta própria (`instagram_manage_insights`) para a próxima entrega de métricas.
- Acesso/feature vigente exigido no painel para Hashtag Search e Business Discovery, além dos escopos básicos necessários; não assumir que conceder OAuth básico libera esses endpoints.
- Confirmação da Meta App, redirect URI, versão atual disponível, permissões com acesso padrão/avançado e requisitos de Business Verification.
- Eventual exigência de revisão adicional do caso de uso e política de retenção/exclusão de dados da plataforma.

Nenhuma conexão externa pode ser apresentada como ativa até callback real bem-sucedido. Sem credenciais, painel e usuário tester, a UI exibe “não configurada” e desabilita a ação. Não usar tokens manuais colados na aplicação nem Graph API Explorer como substituto de OAuth de usuário final.

### Outras fontes previstas, ainda não integradas

- OpenAlex, Crossref e PubMed/NCBI para metadados bibliográficos e links DOI/PMID; abstracts e textos completos respeitam licenças próprias.
- GDELT e fontes institucionais/feeds autorizados para notícias e eventos. Links/metadados não concedem direito de republicar texto, título ou imagem do publisher.
- Google Trends API permanece sujeita à aceitação alpha; BigQuery Trends tem dataset agregado/Top Queries e não substitui busca arbitrária.
- NewsAPI comercial requer orçamento e revisão de direitos; plano gratuito só serve desenvolvimento/teste conforme o provedor.
- TikTok Research API não se destina a SaaS comercial. Não é dependência do Orvia.

Os adaptadores dessas fontes e o motor de evidências não fazem parte da primeira entrega Meta. Nenhum scraping, contorno de login ou coleta não autorizada é permitido.

## IA

Adaptador de provedor configurável; prompts versionados, saídas estruturadas validadas, contexto mínimo e consumo registrado. Tratar indisponibilidade e respostas inválidas como erro. Não enviar dados clínicos/pessoais de pacientes. Documentar retenção/uso pelo fornecedor, limites e custo antes de ativar.

## E-mail, armazenamento e pagamentos

E-mail transacional para verificação e recuperação requer domínio/provedor configurado. S3 compatível só ao surgir necessidade de arquivo/exportação. Pagamentos são posteriores ao MVP; sem cobrança real até decisão e configuração explícitas. Todo webhook futuro precisa ser autenticado e idempotente.

## Estado na Fase 0

Nenhuma integração externa de produto está ativa. A única chamada entre serviços é o health check local da API NestJS, encaminhado pelo Next.js.

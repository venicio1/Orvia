# Segurança e privacidade

## Fase 1A: identidade e perfil

- Senhas usam `node:crypto` scrypt (N=2^17, r=8, p=1, salt aleatório de 16 bytes e chave de 64 bytes); comparação é de tempo constante. Senhas em claro não são armazenadas nem enviadas por e-mail.
- Sessão opaca aleatória de 256 bits, somente SHA-256 no banco, expira em sete dias e é revogável no logout. Redefinir senha invalida todas as sessões. Cookie `HttpOnly`, `SameSite=Lax`, `Path=/` e `Secure` em produção.
- CSRF exige origem web exata e double-submit: cookie legível do mesmo site, cabeçalho `X-CSRF-Token` e hash vinculado à sessão. CORS credenciado aceita apenas `WEB_PUBLIC_URL`.
- Cadastro remove espaços externos e normaliza o e-mail para minúsculas; o PostgreSQL aplica índice único e `CHECK` de lowercase, e a violação única cobre concorrência entre cadastros. A resposta é uniforme e não afirma que a conta foi criada, reduzindo enumeração. O formulário oferece entrar, recuperar acesso e solicitar confirmação sem revelar o estado da conta.
- Acesso exige e-mail confirmado. Tokens de confirmação e reset são aleatórios, de uso único e persistidos somente em hash; expiram em 1 hora e 30 minutos, respectivamente. Há no máximo um token vigente por conta/finalidade: reenvio substitui o link anterior sob lock transacional no PostgreSQL. A confirmação remove o token com condição de validade dentro da mesma transação que confirma o e-mail, evitando uso duplicado concorrente. Resposta de reset é genérica.
- A política mínima de senha é aplicada ao cadastro e à redefinição; login aceita senhas de qualquer comprimento válido armazenado (1–128 caracteres) e responde com erro genérico para credenciais incorretas.
- Limites de autenticação são atômicos no PostgreSQL por IP e e-mail, com chaves em hash; servem também em mais de uma instância com banco compartilhado.
- API local escuta somente `127.0.0.1`. Em produção, `API_HOST` deve expor o serviço apenas à rede privada do Next/proxy. Configure `TRUST_PROXY_HOPS` explicitamente; o proxy público deve remover valores `X-Forwarded-For` fornecidos pelo cliente antes de escrever os endereços reais. O Nest só confia no número de saltos configurado.
- DTOs usam whitelist estrita e recusam campos inesperados. Rotas privadas exigem sessão e consultam/alteram perfil pelo `user_id` autenticado, nunca por ID do cliente.
- Mailpit recebe SMTP local em `127.0.0.1:1025`, com interface em `127.0.0.1:8025`; nenhum e-mail sai para provedor. Produção exige SMTP autenticado/TLS e remetente verificado em variáveis `SMTP_*` e `MAIL_FROM`; provedor específico permanece pendente.
- Arquivos `.env` são ignorados pelo Git; exemplos não incluem credenciais de produção. Não incluir dados clínicos ou identificáveis de pacientes.

## Prontidão para produção da Fase 1A (pendente)

A Fase 1A está concluída para desenvolvimento local, não para lançamento público. Antes da produção:

- Escolher um provedor SMTP, configurar TLS, credenciais em gerenciador de segredos e remetente/domínio verificados; configurar SPF, DKIM e DMARC conforme o provedor. Mailpit não envia e-mail externo.
- Implantar web e API com HTTPS, cookies `Secure`, API em rede privada, `WEB_PUBLIC_URL` correto e `TRUST_PROXY_HOPS` validado para a topologia real.
- Definir armazenamento/rotação de segredos, migrações de deploy, backup e restauração do PostgreSQL, monitoramento e resposta a falhas de entrega de e-mail.
- Fazer validação manual completa no navegador da recuperação e redefinição de senha, inclusive a recusa de reutilização do link.
- Concluir revisão de privacidade, retenção, exclusão e obrigações aplicáveis antes de coletar dados de usuários em produção.

## Requisitos para módulos futuros

- Senhas com hash resistente; sessão revogável em cookie seguro, proteção CSRF e recuperação com token de uso único.
- Autorização por recurso e escopo de usuário em cada consulta/comando; testes de isolamento multiusuário.
- Validação de entradas, limites de requisição e erros sem detalhes internos.
- Tokens sociais cifrados com chaves gerenciadas e rotacionáveis; nunca em logs.
- Auditoria minimizada, sem conteúdo sensível ou tokens.
- Política definida de retenção, acesso, exportação, exclusão e incidente antes da coleta de dados pessoais.
- Não armazenar dados clínicos identificáveis. Orientar o usuário a não os enviar ao mentor.
- Revisar LGPD, normas profissionais de publicidade e contratos de fornecedores antes de lançar funcionalidades afetadas.
- Proteger tarefas e webhooks com idempotência e autenticação.

## IA e mercado

Contexto mínimo necessário, prompts versionados, saídas estruturadas validadas e proveniência explícita. Resistir a instruções maliciosas em conteúdo externo; esse conteúdo é dado, não instrução de sistema. Não alegar causalidade ou resultado garantido.

## Integração Meta — conexão inicial

- Somente OAuth oficial authorization-code via Facebook Login. `state` criptograficamente aleatório, hash persistido, atrelado a usuário/sessão, expira em 10 minutos e é consumido uma vez antes da chamada externa. Início e desconexão exigem origem estrita e CSRF; callback exige a sessão original e state válido.
- A conexão principal continua solicitando `pages_show_list`, `instagram_basic`, `pages_read_engagement`. Uma configuração separada e uma rota protegida autorizam `instagram_manage_insights` para uma conta já conectada. Nenhuma métrica é consultada nesta etapa; publicação, comentários, mensagens, anúncios e permissões amplas de negócio continuam fora do escopo.
- App Secret é usado apenas no backend para o token exchange. Tokens de Page persistidos são cifrados autenticadamente AES-256-GCM, com chave distinta de 32 bytes em `META_TOKEN_ENCRYPTION_KEY`. Não existe fallback para texto claro; sem chave válida a configuração fica desativada. Variáveis Meta não podem usar prefixo `NEXT_PUBLIC_`. Validade de token de Page só é registrada se a API a informar diretamente; validade do token de usuário não é usada como proxy.
- Se `/me/accounts` vier vazio, o token de usuário usado para validar um ID de Página fica cifrado e vinculado a usuário/sessão por até dez minutos, com cinco tentativas máximas. O token pendente é apagado após sucesso e por limpeza periódica; o ID não é aceito como autorização. O fallback só persiste uma conta quando a consulta Meta autenticada devolve o Page ID solicitado, um Page Access Token e um Instagram profissional vinculado.
- Reautorização de Insights tem `config_id` próprio (`META_INSIGHTS_LOGIN_CONFIG_ID`) e state ligado ao usuário, sessão, conta SocialAccount, Page ID e Instagram ID esperados. Não recebe Page ID do browser. `/me/accounts` vazio usa somente a Page ID já armazenada; o callback confere as quatro permissões, o mesmo vínculo Page/Instagram e o Page Access Token antes da troca atômica. Em falha/cancelamento, o ciphertext anterior e os snapshots/posts permanecem intactos.
- Consultas Graph autenticadas usam `Authorization: Bearer`. OAuth code exchange e troca por token de longa duração enviam parâmetros em corpo form-encoded POST para que code, App Secret e tokens não apareçam na URL. Callbacks ainda recebem `code` e `state` na query conforme o fluxo OAuth; os logs de entrada do callback e URLs completas de fetch permanecem desativados.
- Nenhum token, state, authorization code, secret, chave ou URL com credenciais deve ser escrito em logs, analytics ou mensagens de erro. Respostas públicas contêm somente IDs/nomes/escopos e estados permitidos.
- O callback OAuth é excluído do log de requisições de desenvolvimento do Next.js; `fetches.fullUrl` permanece desabilitado para que URLs completas não sejam registradas. A implantação deve configurar proxies e observabilidade para também não registrar query strings de callback.
- Desconexão no Orvia remove imediatamente token ciphertext e escopos; mantém estado desconectado e histórico de execução sem credenciais. A permissão concedida ao aplicativo continua administrada na conta Meta; a UI orienta a revogação nos controles de aplicativos/integrações da Meta. Fluxo formal de eliminação da conta Meta e retenção final depende de política LGPD e dos termos vigentes da Meta antes da produção.
- A aplicação não acessa API externa se a configuração estiver incompleta. A conexão real de teste de `@unicstreetbr` foi confirmada em 2026-10-15 com callback permitido e conta profissional vinculada a Página. Mocks não são apresentados como conexão real; validação de produção e de outros endpoints continua pendente.
- Acesso ao endpoint/escopo não é presumido. App Review, Advanced Access, verificação empresarial e permissões para Insights/Business Discovery/hashtags devem ser confirmados no painel da aplicação.

## Fase 1B: diagnóstico e estratégia inicial

- As rotas exigem sessão; mutações também exigem origem e CSRF. O cliente não envia `userId`; escopo sempre vem da sessão validada.
- Listagem, detalhe e revisão incluem o proprietário na consulta. A migração aplica FK composta `strategies(diagnostic_id,user_id)` → `diagnostics(id,user_id)` e índice parcial para apenas uma versão atual.
- Snapshot contém somente os campos profissionais utilizados, objetivos, experiência/frequência e disponibilidade. O texto livre do público-alvo é reduzido a um marcador de presença para não copiar conteúdo que possa inadvertidamente identificar pacientes. Não coletar relatos identificáveis, dados clínicos de pacientes, credenciais sociais ou dados de audiência.
- Resultado e salvaguardas vêm de regras locais. Nenhum provedor de IA, scraping, API social ou fonte de mercado é chamado.
- A interface diferencia declarações, inferências, sugestões e limites. A pontuação mede preenchimento/organização do perfil, nunca desempenho, procura ou previsão.
- A geração é serializada em transação PostgreSQL; pedido repetido para perfil e critério inalterados retorna a versão atual. Histórico não é reescrito.
- Salvaguardas são recomendações gerais do produto, não aconselhamento jurídico; orientar a conferir as normas vigentes do conselho profissional.

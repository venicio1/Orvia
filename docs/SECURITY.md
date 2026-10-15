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

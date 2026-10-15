# Segurança e privacidade

## Base da Fase 0

Não há cadastro, sessão nem integração externa ativa nesta fase. PostgreSQL e Redis são opcionais e locais. Não inserir segredos no repositório. Arquivos `.env` são ignorados pelo Git; os `.env.example` contêm somente valores locais de desenvolvimento sem privilégio.

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

# Modelo inicial de dados

PostgreSQL e Prisma 7. A migração versionada em `apps/api/prisma/migrations/20261015174248_identity_profile` implementa persistência de identidade e perfil. Nenhum dado clínico de paciente é coletado.

## Entidades

- `User`: e-mail normalizado único, hash de credencial, confirmação e datas.
- `Session`: hash do identificador e CSRF, validade, revogação e usuário. Cookie opaco não persiste em claro.
- `AuthToken`: hash de token de uso único para confirmação de e-mail ou redefinição de senha, finalidade e validade.
- `RateLimitBucket`: contador e janela de limite por chave derivada de IP/e-mail.
- `ProfessionalProfile`: usuário, nome profissional, profissão, especialidade, região, modalidade, público, objetivos, disponibilidade, experiência e frequência social, preferências de comunicação e progresso do onboarding.
- `SocialAccount` / `SyncRun`: provedor, identificador externo, escopos, token cifrado, validade e execução de sincronização.
- `SocialPost` / `MetricSnapshot`: publicação e valores versionados com origem, período, observação e data da coleta.
- `Diagnostic` / `DiagnosticFinding`: metodologia, dimensões, evidências, resultado e recomendações.
- `MarketSource` / `MarketObservation`: fonte, autorização/método, data, evidência e observação.
- `Opportunity`: tema, justificativa, evidências, prioridade, dificuldade e estado.
- `Strategy` / `StrategyActivity`: versão, objetivo, período, atividades e aprovação.
- `Journey` / `Challenge` / `ChallengeEvidence`: catálogo, estado, prazo, recompensa e comprovação sem conteúdo clínico.
- `ContentPlanItem`: tema, formato, objetivo, data e estado.
- `ConversionEvent`: evento manual ou integrado, sem identidade de paciente.
- `MentorConversation` / `MentorMessage`: contexto referenciado, modelo, versão de prompt e consumo minimizado.
- `WeeklyReview` / `WeeklyFeedback` / `MonthlyReport`: janela/fuso, estado de processamento, consolidação e feedback.
- `Notification`, `Subscription`, `AuditEvent`: preferências e eventos operacionais com dados mínimos.

## Integridade e índices

Tabelas de usuário devem incluir `user_id` ou vínculo verificável; autorização sempre aplica escopo no servidor. Índices para FKs, `user_id`, estado e data de consulta. Restrições únicas para e-mail normalizado, versões de estratégia e (usuário, início da semana). IDs externos únicos por provedor. Valores de métricas não negativos e enums de estado limitados.

## Retenção e privacidade

Definir prazos antes de habilitar conversas, snapshots ou logs. Tokens sociais cifrados fora da camada ORM e excluídos dos logs. Exclusão de usuário deve revogar tokens e apagar/anomizar registros conforme política legal definida. Não persistir dados clínicos de pacientes. As credenciais do Compose são de desenvolvimento local, com portas presas a `127.0.0.1`; nunca reutilizar em ambiente compartilhado.

## Questões a fechar

Semântica de exclusão/anomização; retenção de conversas; granularidade e janela de métricas; estratégia de fuso/semana; catálogo de profissões e fontes. Perfil é um-para-um por `user_id`; leitura e escrita usam exclusivamente o `user_id` da sessão. Disponibilidade semanal tem limite de 0 a 2400 minutos; constraints e cardinalidades estão na migration SQL `20261015180000_identity_constraints`. Use `pnpm db:migrate` em desenvolvimento e `pnpm db:deploy` para aplicar migrações já versionadas. Nunca remova volumes.

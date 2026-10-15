# Modelo inicial de dados

Fase 0 configura Compose para PostgreSQL/Redis e Prisma 7. O schema inicial `apps/api/prisma/schema.prisma` contém somente `User` e `ProfessionalProfile`, sem credenciais nem dados clínicos. Ainda não há migração aplicada nem endpoints que leiam ou gravem dados; o modelo completo abaixo é a base a expandir e validar na Fase 1.

## Entidades

- `User`: e-mail normalizado único, hash de credencial, estado e datas.
- `Session`: hash do identificador, validade, revogação e usuário.
- `ProfessionalProfile`: usuário, profissão, especialidade, região, modalidade, público e objetivos.
- `ProfilePreference`: disponibilidade, formatos, frequência, fuso e preferências.
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

Semântica de exclusão/anomização; retenção de conversas; granularidade e janela de métricas; estratégia de fuso/semana; catálogo de profissões e fontes. A primeira migração será criada/versionada com Prisma quando os campos da Fase 1 forem aprovados.

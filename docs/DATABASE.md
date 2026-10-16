# Modelo inicial de dados

PostgreSQL e Prisma 7. A migração versionada em `apps/api/prisma/migrations/20261015174248_identity_profile` implementa persistência de identidade e perfil. Nenhum dado clínico de paciente é coletado.

A Fase 1B acrescenta `diagnostics` e `strategies` pela migração `20261015190000_diagnostics_initial_strategy`. O snapshot contém somente campos profissionais usados pelo cálculo. Cada diagnóstico inclui versão sequencial, critérios, fingerprint da entrada, resultado JSON, estado `current`/`superseded` e data opcional de revisão. A estratégia fica associada à versão correspondente; FK composta exige o mesmo `user_id`. Índice parcial permite no máximo um diagnóstico atual por usuário.

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

### Conexão Meta (primeira entrega)

- `MetaOAuthAttempt`: hash SHA-256 do state, proprietário e sessão de origem, validade de dez minutos, consumo; FK composta `(session_id,user_id)` garante que a sessão pertença ao mesmo usuário da tentativa. Quando `/me/accounts` retorna vazio, campos adicionais guardam temporariamente ciphertext do token de usuário, escopos, prazo de dez minutos, consumo e tentativas do fallback por ID. A FK e as consultas da API mantêm a tentativa presa ao mesmo usuário/sessão; o ciphertext temporário é removido ao conectar ou expirar.
- `SocialAccount`: conta profissional Instagram por usuário/provedor, Page vinculada, nome de usuário, escopos concedidos, token cifrado AES-256-GCM, validade informada, estado e datas de conexão/desconexão. Unicidade por `(user_id, provider, provider_account_id)` evita contas repetidas para o mesmo usuário. Desconectar apaga o ciphertext, escopos e mantém metadados de auditoria operacional mínimos.
- `SocialSyncRun`: histórico de descoberta OAuth e futuras sincronizações, sem corpo bruto de resposta nem tokens. Guarda operação, estado, timestamps, contagem e código de erro redigido. FK composta `(social_account_id,user_id)` garante que uma execução só se relacione à conta do mesmo proprietário. Desconectar mantém a conta em estado desconectado e preserva o histórico; hard delete de conta ou usuário remove as execuções relacionadas.
- `InstagramProfileSnapshot` (Fase 1D.1): único snapshot atual por conta social, com os oito campos de perfil retornados, `returned_fields` para diferenciar campo omitido de campo nulo, fonte `instagram_graph_api`, versão Graph e `fetched_at`. FK composta `(social_account_id,user_id)` impede cruzamento de proprietário. Releituras válidas substituem o snapshot; falhas não o modificam. Desconectar apaga o snapshot, mas mantém as execuções operacionais sem credenciais. Campos de contagem permanecem nulos quando ausentes e zero quando a Meta retorna zero.
- `InstagramMediaSyncState` (Fase 1D.2): um estado por conta com cursor opaco da Meta (somente backend), `has_more`, páginas/registros consultados, campos pedidos/indisponíveis, status, avisos, última tentativa/sucesso e data de conclusão. A sincronização só recebe `succeeded` quando a API não indica outra página.
- `InstagramMediaPost`: publicações reais recebidas da aresta oficial `/media`, chave única `(social_account_id, provider_media_id)`, metadados `IMAGE`, `VIDEO` ou `CAROUSEL_ALBUM`, origem, versão API, campos efetivamente retornados e horário da coleta. Upsert não elimina registros que não apareceram em uma resposta.
- `InstagramMediaAsset`: itens filhos de carrossel por posição, com chave única por conta/ID externo e FK composta para a publicação, conta e usuário. `user_id` e FKs compostas mantêm isolamento também no PostgreSQL. Desconectar remove posts, filhos e estado de sync junto ao snapshot, mas preserva `SocialSyncRun` sem credenciais.

URLs de mídia são aceitas apenas em HTTPS e hosts de CDN Meta conhecidos; URLs com parâmetros de token/segredo são descartadas. Tokens nunca são selecionados por endpoints de leitura. O cursor Meta não é entregue ao navegador: o frontend apenas pede a próxima página, e o backend usa o cursor opaco guardado no estado da conta. Contagem do perfil, quantidade armazenada e quantidade carregada são apresentadas separadamente.

As entidades acima não afetam FK, versões ou snapshots de `Diagnostic` e `Strategy`. O snapshot de perfil Instagram e as publicações não são usados em diagnósticos/recomendações. Insights e observações de mercado permanecem fora da Fase 1D.2.

### Diagnóstico e estratégia inicial (Fase 1B)

- `Diagnostic.profile_snapshot` registra os campos do perfil usados pela versão; o texto livre de público-alvo é reduzido a um marcador de presença para não copiar conteúdo que possa inadvertidamente identificar pacientes. `result` contém pontuação, método, dimensões, evidências declaradas, oportunidades e limitações.
- `criteria_version` identifica as regras. `orvia-diagnostico-1.1.0`: Fundamentos dá 25 pontos por profissão, especialidade, região e presença de público-alvo; Direção dá 0/50/100 para nenhum/um/dois ou mais objetivos; Rotina dá 50 pontos por experiência e frequência informadas; Disponibilidade dá 100 quando informada (inclusive zero), 0 quando ausente. A média simples das quatro dimensões é arredondada ao inteiro. Disponibilidade mede se foi informada, não sua quantidade; pouca disponibilidade só limita o plano.
- `input_fingerprint` identifica repetição do mesmo perfil/critério. Advisory lock transacional e índice parcial tornam a criação idempotente em cliques concorrentes e asseguram só uma versão atual.
- `Strategy.plan` contém objetivo, prioridades, ações, esforço estimado e indicadores; `guardrails` contém as salvaguardas gerais mostradas na interface. Não significa execução, aprovação ou integração.
- Alteração dos campos relevantes do perfil cria nova versão e marca a anterior como `superseded`; histórico não é sobrescrito. Se o perfil voltar a um estado anterior depois de outra versão, será criada nova versão.
- Listagem, detalhe e revisão aplicam o `user_id` autenticado; FK composta valida a propriedade entre estratégia e diagnóstico.

## Integridade e índices

Tabelas de usuário devem incluir `user_id` ou vínculo verificável; autorização sempre aplica escopo no servidor. Índices para FKs, `user_id`, estado e data de consulta. Restrições únicas para e-mail normalizado, versões de estratégia e (usuário, início da semana). IDs externos únicos por provedor. Valores de métricas não negativos e enums de estado limitados.

## Retenção e privacidade

Definir prazos antes de habilitar conversas, snapshots ou logs. Tokens sociais cifrados fora da camada ORM e excluídos dos logs. Exclusão de usuário deve revogar tokens e apagar/anomizar registros conforme política legal definida. Não persistir dados clínicos de pacientes. As credenciais do Compose são de desenvolvimento local, com portas presas a `127.0.0.1`; nunca reutilizar em ambiente compartilhado.

## Questões a fechar

Semântica de exclusão/anomização; retenção de conversas; granularidade e janela de métricas; estratégia de fuso/semana; catálogo de profissões e fontes. Perfil é um-para-um por `user_id`; leitura e escrita usam exclusivamente o `user_id` da sessão. Disponibilidade semanal tem limite de 0 a 2400 minutos; constraints e cardinalidades estão na migration SQL `20261015180000_identity_constraints`. Use `pnpm db:migrate` em desenvolvimento e `pnpm db:deploy` para aplicar migrações já versionadas. Nunca remova volumes.

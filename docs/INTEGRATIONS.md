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

Integração futura exclusivamente por fluxo oficial Meta e contas/permissões elegíveis. Confirmar documentação, produto, permissões, revisão do app, métricas, limites e política de retenção antes da implementação. Tokens devem ser criptografados, expiração/revogação tratadas e conexão desconectável pelo usuário. Não presumir métricas privadas de perfis de referência nem usar scraping. Métricas devem indicar origem e data de coleta.

## IA

Adaptador de provedor configurável; prompts versionados, saídas estruturadas validadas, contexto mínimo e consumo registrado. Tratar indisponibilidade e respostas inválidas como erro. Não enviar dados clínicos/pessoais de pacientes. Documentar retenção/uso pelo fornecedor, limites e custo antes de ativar.

## E-mail, armazenamento e pagamentos

E-mail transacional para verificação e recuperação requer domínio/provedor configurado. S3 compatível só ao surgir necessidade de arquivo/exportação. Pagamentos são posteriores ao MVP; sem cobrança real até decisão e configuração explícitas. Todo webhook futuro precisa ser autenticado e idempotente.

## Estado na Fase 0

Nenhuma integração externa de produto está ativa. A única chamada entre serviços é o health check local da API NestJS, encaminhado pelo Next.js.

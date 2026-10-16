# Configuração manual do aplicativo Meta

## Situação atual

O Orvia implementa o início/callback OAuth, descoberta principal por `/me/accounts`, fallback por ID da Página com validação da Graph API e persistência segura. Em 2026-10-15, o proprietário confirmou uma conexão real de `@unicstreetbr` pela Página `Orvia Testes`, usando o fallback porque `/me/accounts` retornou vazio. Os segredos permanecem apenas no `.env` ignorado local; seus valores não devem ser exibidos nem compartilhados.

Não envie App Secret, token ou chave de cifragem pelo chat. Configure-os diretamente no arquivo local ignorado pelo Git `apps/api/.env` ou no gerenciador de segredos do ambiente. Não os coloque em `apps/web/.env`, variáveis `NEXT_PUBLIC_*`, issue, screenshot ou log.

## Passos que o proprietário precisa executar no painel Meta

1. Entre no [Meta for Developers](https://developers.facebook.com/) com a conta que administra o negócio/app.
2. Crie ou selecione um aplicativo apropriado ao caso de uso Business/API da Instagram Platform. Não habilite produtos de anúncios, publicação, mensagens ou comentários para esta entrega.
3. Adicione/configure a experiência **Instagram API with Facebook Login** (Facebook Login/OAuth e Instagram Graph API conforme os produtos disponíveis no painel atual).
4. Em Facebook Login for Business/Settings, habilite OAuth Web. Em modo Development, a Meta informa que `localhost` é permitido automaticamente; não force cadastro se o próprio painel confirmar isso. O URI enviado pelo Orvia precisa corresponder exatamente ao `META_REDIRECT_URI`:
   - Desenvolvimento local: `http://localhost:3000/api/integrations/meta/callback`
   - Produção: URL HTTPS pública e exata do proxy web que encaminha `/api/integrations/meta/callback` à API privada.
5. Preencha domínios do app e configure os campos exigidos pelo painel: URL pública de política de privacidade, instruções/URL de exclusão de dados, contato, categoria e dados empresariais. Não publique o app antes de esses destinos estarem acessíveis e refletirem os dados realmente tratados pelo Orvia.
6. Em App Roles/Roles, adicione sua conta Facebook como Developer/Admin/Tester e permita testar o produto. Em uma conta de teste controlada, converta/vincule o Instagram como Business ou Creator e associe-o a uma Facebook Page que o mesmo usuário possa administrar.
7. Na configuração Facebook Login for Business, selecione o tipo **User access token**. O OAuth do Orvia usa `config_id`; as permissões são definidas nesta configuração no painel, portanto o app não envia `scope` na URL de autorização.
8. A configuração principal `Orvia - Instagram Connection` deve manter tipo **User access token** e somente `pages_show_list`, `instagram_basic` e `pages_read_engagement`. O fluxo separado de reautorização usa `Orvia - Instagram Insights` com essas três permissões e `instagram_manage_insights`; ele não altera nem substitui a configuração principal. Não adicione permissões de mensagem, publicação ou anúncios.
9. Em **App settings → Basic**, copie App ID e App Secret; o App ID é identificador público, mas o App Secret é privado. Copie também o Configuration ID da configuração de conexão. Preencha-os apenas em `apps/api/.env`. A versão Graph configurada localmente é `v26.0`, a versão atual indicada pela documentação Meta nesta revisão; reavalie ao atualizar a integração.
10. Gere uma chave independente para cifrar tokens. O comando abaixo grava a chave diretamente em `apps/api/.env` e imprime somente uma confirmação, sem exibir o valor. Execute na raiz do repositório:

   ```powershell
   node -e "const fs=require('node:fs'),crypto=require('node:crypto');const p='apps/api/.env';const s=fs.readFileSync(p,'utf8').replace(/^\\uFEFF/,'');const lines=s.split(/\\r?\\n/).filter(x=>!/^META_TOKEN_ENCRYPTION_KEY=/.test(x));lines.push('META_TOKEN_ENCRYPTION_KEY='+crypto.randomBytes(32).toString('base64'));fs.writeFileSync(p,lines.join('\\n')+'\\n','utf8');console.log('Encryption key stored locally; value not displayed.')"
   ```

11. Configure as variáveis no backend (`apps/api/.env`):

   ```dotenv
   META_APP_ID=<App ID do painel>
   META_APP_SECRET=<App Secret do painel>
   META_LOGIN_CONFIG_ID=<Configuration ID do Facebook Login for Business>
   META_INSIGHTS_LOGIN_CONFIG_ID=<Configuration ID da configuração Orvia - Instagram Insights>
   META_GRAPH_API_VERSION=v26.0
   META_REDIRECT_URI=http://localhost:3000/api/integrations/meta/callback
   META_TOKEN_ENCRYPTION_KEY=<chave-base64-32-bytes-gerada-localmente>
   ```

12. Reinicie a API, entre no Orvia e abra **Configurações → Instagram via Meta → Continuar para a Meta**. Revise a tela de consentimento, aceite apenas as permissões da configuração e retorne. O Orvia tenta `/me/accounts`; se a Meta retornar vazio, a interface permite informar o ID da Página. A conexão só é salva quando a consulta autenticada da Meta retorna o mesmo ID, um Page Access Token e o Instagram profissional vinculado.
13. Para produção e usuários externos, use App Review/Data Use Checkup/Business Verification e níveis de acesso conforme indicados para cada permissão ou feature pelo painel. Grave a URL de política de privacidade e exclusão, documente o caso de uso, envie screencast real com conta de teste e teste o fluxo com tester antes de solicitar acesso avançado.

## Validações obrigatórias no painel antes do acesso de mercado

O proprietário deve conferir, pois não é possível verificar remotamente o estado de um Meta App sem uma sessão autorizada do negócio:

- O aplicativo está em modo Development ou Live correto e quais funções de usuário conseguem autorizar.
- Cada permissão mostra Standard ou Advanced Access, elegibilidade, revisão pendente/aprovada e, se aplicável, requisito de Business Verification.
- Se Hashtag Search e Business Discovery estão disponíveis para o app atual e qual permissão/feature específica é exigida. Não tratar o endpoint listado na documentação como autorização concedida.
- A reautorização dedicada solicita `instagram_manage_insights` apenas pela configuração Insights. Esta entrega ainda não consulta métricas; a concessão do escopo só habilita a credencial para uma etapa posterior.
- A conta selecionada é profissional e vinculada à Page correta, e o usuário do fluxo tem tarefa/acesso suficiente à Page.
- O callback OAuth usado no fluxo coincide byte a byte com `META_REDIRECT_URI`; para localhost em Development a Meta informa autorização automática, enquanto produção usa HTTPS e domínio verificado.
- Limites efetivos, versão da API, retenção, exclusão, atribuição e uso permitido conforme os termos em vigor.

## Descoberta da Página quando `/me/accounts` vier vazio

O caminho principal continua sendo `GET /me/accounts` com o token de usuário concedido ao Orvia. Se a Meta retornar uma lista vazia, o callback mantém esse token **cifrado por até 10 minutos**, vinculado à mesma conta e sessão Orvia, e solicita o ID de uma Página. O ID é somente um seletor: o backend consulta `/{page-id}` com o token OAuth do usuário e pede `id`, `name`, `access_token` e `instagram_business_account{id,username}`. A conexão só é gravada se a Graph API retornar o mesmo ID, um Page Access Token e o Instagram profissional vinculado. Campos públicos (como nome/ID), por si sós, não autorizam conexão.

O fallback aceita no máximo cinco tentativas, não recebe nem armazena tokens enviados pelo navegador, e apaga o token OAuth temporário após sucesso. Um limpador no backend remove pendências expiradas a cada minuto (limpeza em até cerca de um minuto após o prazo). Os tokens de Página salvos continuam cifrados com AES-GCM e isolados pelo `userId`. Nenhuma permissão adicional é solicitada pelo fallback. A consulta direta por ID segue o padrão oficial Meta de obter token de uma Página específica quando o ID já é conhecido: [Meta Instagram API – Get Specific Page Access Token](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api).

Em desenvolvimento, o Next.js ignora o log de requisição do callback OAuth para que `code` e `state` não apareçam na linha de log de entrada. Não registre a URL completa de callback em proxies, ferramentas de observabilidade ou suporte.

Se a Meta não retornar `access_token` para a Página informada, o Orvia não conecta, mesmo que ID, nome ou Instagram sejam publicamente consultáveis. Não use tokens copiados do Graph API Explorer no Orvia.

## Revisão do aplicativo

Antes de submeter para acesso de usuários externos:

- demonstrar a conexão do zero, consentimento e uso apenas dos dados correspondentes a cada permissão;
- demonstrar desconexão e eliminação do token cifrado no Orvia;
- fornecer política de privacidade e método de solicitação de exclusão que cubram conexão Meta, escopos, identificadores e histórico de sincronização;
- explicar necessidade específica de cada escopo, sem pedir publicação, comentários, mensagens, Ads ou escopos globais para habilitar consulta somente leitura;
- anexar gravação de tela real com conta de teste aprovada e sem expor tokens/segredos;
- manter documentação da fonte, retenção, segurança, subprocessadores e controles de acesso.

Meta pode alterar permissões, endpoints e critérios. A lista acima não substitui a indicação atual do painel, e nenhuma capacidade condicional deve ser anunciada como ativa antes da aprovação.

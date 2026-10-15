"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AtSign, Check, ExternalLink, LoaderCircle, LockKeyhole, RefreshCw, Unplug } from "lucide-react";
import { csrfToken } from "@/lib/csrf";

type ConnectedAccount = {
  id: string;
  providerAccountId: string;
  pageName: string | null;
  username: string | null;
  grantedScopes: string[];
  tokenExpiresAt: string | null;
  status: string;
  connectedAt: string;
};
type ConnectionStatus = { configured: boolean; requiredScopes: string[]; optionalFutureScopes: string[]; accounts: ConnectedAccount[] };
type LoadState = "loading" | "ready" | "error";

const messages: Record<string, { kind: "success" | "error"; text: string }> = {
  connected: { kind: "success", text: "Autorização concluída. As contas profissionais elegíveis retornadas pela Meta foram conectadas." },
  denied: { kind: "error", text: "A autorização foi cancelada. Nenhuma conta foi conectada." },
  invalid_state: { kind: "error", text: "A solicitação expirou ou não corresponde à sessão atual. Inicie a conexão novamente." },
  session_expired: { kind: "error", text: "Sua sessão expirou durante a autorização. Entre novamente e tente conectar." },
  no_accessible_pages: { kind: "error", text: "A Meta não retornou Páginas acessíveis para esta conta Facebook. Confira o acesso da sua conta à Página e tente novamente." },
  page_id_required: { kind: "success", text: "A Meta não listou Páginas. Você pode informar o ID de uma Página para verificar o acesso com a autorização atual." },
  pages_without_instagram: { kind: "error", text: "Encontramos Páginas acessíveis, mas nenhuma retornou uma conta Instagram profissional vinculada. Confira o vínculo da Página com o Instagram Business no Meta Business Suite." },
  missing_permissions: { kind: "error", text: "A Meta não concedeu todas as permissões mínimas. Confira os escopos liberados no painel e autorize novamente." },
  graph_api_error: { kind: "error", text: "A Graph API da Meta não concluiu a consulta. Nenhuma conta foi salva; tente novamente e, se persistir, confira os detalhes técnicos registrados sem tokens ou dados de conta." },
  not_configured: { kind: "error", text: "A configuração da aplicação Meta está incompleta neste ambiente." },
  failed: { kind: "error", text: "O Orvia encontrou um erro interno ao registrar a integração. Nenhuma conta foi salva. Tente novamente mais tarde." },
};

export function MetaConnectionPanel({ callbackResult }: { callbackResult?: string }) {
  const [state, setState] = useState<LoadState>("loading");
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pageId, setPageId] = useState("");
  const [showPageFallback, setShowPageFallback] = useState(callbackResult === "page_id_required");
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(callbackResult ? messages[callbackResult] ?? null : null);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const response = await fetch("/api/integrations/meta/status", { credentials: "same-origin", cache: "no-store" });
      const result = await response.json().catch(() => null) as ConnectionStatus | null;
      if (!response.ok || !result || typeof result.configured !== "boolean" || !Array.isArray(result.accounts)) throw new Error("Não foi possível consultar o estado da conexão Meta.");
      setStatus(result);
      setState("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível consultar o estado da conexão Meta.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    let current = true;
    void fetch("/api/integrations/meta/status", { credentials: "same-origin", cache: "no-store" })
      .then(async response => {
        const result = await response.json().catch(() => null) as ConnectionStatus | null;
        if (!response.ok || !result || typeof result.configured !== "boolean" || !Array.isArray(result.accounts)) throw new Error("Não foi possível consultar o estado da conexão Meta.");
        if (current) { setStatus(result); setState("ready"); }
      })
      .catch(cause => {
        if (current) {
          setError(cause instanceof Error ? cause.message : "Não foi possível consultar o estado da conexão Meta.");
          setState("error");
        }
      });
    return () => { current = false; };
  }, []);

  async function connect() {
    setBusy("connect"); setNotice(null);
    try {
      const response = await fetch("/api/integrations/meta/connect", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "x-csrf-token": csrfToken() }, body: "{}",
      });
      const result = await response.json().catch(() => null) as { authorizationUrl?: string; message?: string } | null;
      if (!response.ok || !result?.authorizationUrl) throw new Error(result?.message ?? "A conexão Meta ainda não está configurada neste ambiente.");
      window.location.assign(result.authorizationUrl);
    } catch (cause) {
      setNotice({ kind: "error", text: cause instanceof Error ? cause.message : "Não foi possível iniciar a conexão." });
      setBusy(null);
    }
  }

  async function disconnect(account: ConnectedAccount) {
    setBusy(account.id); setNotice(null);
    try {
      const response = await fetch(`/api/integrations/meta/accounts/${encodeURIComponent(account.id)}`, {
        method: "DELETE", credentials: "same-origin", headers: { "x-csrf-token": csrfToken() },
      });
      const result = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(result?.message ?? "Não foi possível remover a conexão.");
      setNotice({ kind: "success", text: result?.message ?? "Conexão removida." });
      await load();
    } catch (cause) {
      setNotice({ kind: "error", text: cause instanceof Error ? cause.message : "Não foi possível remover a conexão." });
    } finally { setBusy(null); }
  }

  async function connectPageById(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("page"); setNotice(null);
    try {
      const response = await fetch("/api/integrations/meta/connect/page", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "x-csrf-token": csrfToken() },
        body: JSON.stringify({ pageId: pageId.trim() }),
      });
      const result = await response.json().catch(() => null) as { outcome?: string; message?: string } | null;
      if (!response.ok) throw new Error(result?.message ?? "Não foi possível validar o acesso à Página.");
      if (result?.outcome === "connected") {
        setPageId("");
        setShowPageFallback(false);
        window.history.replaceState(null, "", "/configuracoes");
        setNotice({ kind: "success", text: "A Meta confirmou o acesso e a conta profissional foi conectada." });
        await load();
      } else if (result?.outcome === "page_without_instagram") {
        setNotice({ kind: "error", text: "A Meta confirmou o acesso à Página, mas não retornou um Instagram profissional vinculado." });
      } else if (result?.outcome === "page_not_authorized") {
        setNotice({ kind: "error", text: "A Meta não confirmou autorização para conectar essa Página. Confira se ela pertence aos ativos acessíveis pela conta autorizada." });
      } else if (result?.outcome === "missing_permissions") {
        setNotice({ kind: "error", text: "A Meta não concedeu permissões suficientes para validar essa Página." });
      } else if (result?.outcome === "graph_api_error") {
        setNotice({ kind: "error", text: "A Graph API não concluiu a validação. Nenhuma conta foi conectada; tente novamente mais tarde." });
      } else if (result?.outcome === "page_discovery_expired") {
        setShowPageFallback(false);
        setNotice({ kind: "error", text: "A autorização para validar a Página expirou ou atingiu o limite de tentativas. Inicie uma nova conexão com a Meta." });
      } else if (result?.outcome === "meta_not_configured") {
        setShowPageFallback(false);
        setNotice({ kind: "error", text: "A configuração da integração Meta não está disponível neste ambiente." });
      } else {
        throw new Error("A verificação não foi concluída. Inicie uma nova autorização e tente novamente.");
      }
    } catch (cause) {
      setNotice({ kind: "error", text: cause instanceof Error ? cause.message : "Não foi possível validar a Página." });
    } finally { setBusy(null); }
  }

  return <section className="integration-card" aria-labelledby="meta-title">
    <div className="integration-card-heading">
      <span className="integration-icon"><AtSign size={19} aria-hidden="true" /></span>
      <div><span className="section-kicker">CONTA PROFISSIONAL</span><h2 id="meta-title">Instagram via Meta</h2></div>
      {state === "ready" && <span className={`integration-status ${status?.accounts.length ? "is-connected" : "is-disconnected"}`}><span />{status?.accounts.length ? "Conectada" : "Não conectada"}</span>}
    </div>

    {notice && <p className={`integration-notice ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</p>}
    {state === "loading" && <div className="integration-state" role="status"><LoaderCircle className="spin" size={18} /><span>Consultando o estado da autorização…</span></div>}
    {state === "error" && <div className="integration-state error" role="alert"><p>{error}</p><button className="integration-button secondary" onClick={() => void load()}><RefreshCw size={15} /> Tentar novamente</button></div>}
    {state === "ready" && status && !status.configured && <div className="integration-unconfigured">
      <div className="integration-state"><LockKeyhole size={17} /><span>A autorização real está desativada porque as credenciais da aplicação Meta não foram configuradas.</span></div>
      <p>O Orvia ainda não consulta dados do Instagram. Para habilitar o OAuth, configure o aplicativo Meta, o URI de retorno, a versão da Graph API e a chave de criptografia do token somente no ambiente do backend.</p>
      <p className="integration-scopes">Permissões mínimas solicitadas nesta entrega: <code>{status.requiredScopes.join(" · ")}</code></p>
    </div>}
    {state === "ready" && status && status.configured && <>
      <p className="integration-description">Conecte uma conta profissional do Instagram (Business ou Creator) vinculada a uma Página que você administra. Esta etapa só valida a autorização e identifica contas acessíveis; ainda não sincroniza publicações, métricas ou dados de terceiros.</p>
      <p className="integration-description">A Meta pode retornar várias contas profissionais vinculadas às Páginas acessíveis ao seu Facebook. Nesta entrega, todas as contas elegíveis retornadas serão conectadas; depois você poderá desconectar individualmente as que não deseja manter.</p>
      {status.accounts.length > 0 && <p className="integration-description">A Meta retornou estas contas profissionais vinculadas às Páginas acessíveis. Todas as contas elegíveis listadas são conectadas nesta etapa; você pode desconectar as que não deseja manter.</p>}
      {status.accounts.length > 0 && <ul className="connected-account-list" aria-label="Contas conectadas">
        {status.accounts.map(account => <li key={account.id} className="connected-account">
          <div className="connected-account-avatar" aria-hidden="true">@</div>
          <div className="connected-account-copy"><strong>{account.username ? `@${account.username}` : account.pageName ?? "Conta profissional"}</strong><small>{account.pageName ?? "Página vinculada"} · Conectada em {new Date(account.connectedAt).toLocaleDateString("pt-BR")}</small><small className="scope-summary">Escopos autorizados: {account.grantedScopes.join(", ")}</small></div>
          <button className="integration-button disconnect" disabled={busy !== null} onClick={() => void disconnect(account)} aria-label={`Desconectar ${account.username ? `@${account.username}` : account.pageName ?? "conta"}`}>
            {busy === account.id ? <LoaderCircle size={15} className="spin" /> : <Unplug size={15} />} Desconectar
          </button>
        </li>)}
      </ul>}
      {showPageFallback && <form className="integration-page-id-form" onSubmit={event => void connectPageById(event)}>
        <label htmlFor="meta-page-id">ID da Página do Facebook</label>
        <p>Apenas o ID é solicitado. O Orvia consulta a Meta com a autorização que você acabou de conceder e só conecta se receber um token dessa Página e a conta Instagram profissional vinculada. O ID, sozinho, não concede acesso.</p>
        <div className="integration-actions"><input id="meta-page-id" inputMode="numeric" autoComplete="off" pattern="[0-9]{1,32}" maxLength={32} required value={pageId} onChange={event => setPageId(event.target.value)} aria-describedby="meta-page-id-help" />
          <button className="integration-button primary" type="submit" disabled={busy !== null}>{busy === "page" ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} Validar Página</button></div>
        <span id="meta-page-id-help" className="integration-footnote">A autorização atual expira em até 10 minutos. O token temporário fica cifrado no servidor, vinculado à sua sessão, e é apagado após a conexão ou expiração.</span>
      </form>}
      <div className="integration-actions"><button className="integration-button primary" onClick={() => void connect()} disabled={busy !== null}>
        {busy === "connect" ? <LoaderCircle size={15} className="spin" /> : status.accounts.length ? <RefreshCw size={15} /> : <ExternalLink size={15} />}
        {status.accounts.length ? "Atualizar autorização" : "Continuar para a Meta"}
      </button><span><Check size={13} /> Apenas permissões necessárias para identificar a conta</span></div>
    </>}
    <div className="integration-footnote">Nenhum dado de pacientes é solicitado. Desconectar apaga do Orvia o token armazenado e os escopos registrados. Para revogar também a autorização concedida ao aplicativo na Meta, remova o acesso do Orvia nos controles de aplicativos/integrações da sua conta Meta. O histórico operacional permanece sem credenciais.</div>
  </section>;
}

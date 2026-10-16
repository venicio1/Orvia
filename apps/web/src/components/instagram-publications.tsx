"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AlertCircle, ArrowUpRight, Camera, Images, LoaderCircle, RefreshCw, ShieldAlert } from "lucide-react";
import { csrfToken } from "@/lib/csrf";

type Asset = { id: string; position: number; mediaType: string; mediaUrl: string | null; thumbnailUrl: string | null; returnedFields: string[] };
type Post = {
  id: string; providerMediaId: string; caption: string | null; publishedAt: string | null; permalink: string | null;
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM"; mediaProductType: string | null; mediaUrl: string | null;
  thumbnailUrl: string | null; returnedFields: string[]; fetchedAt: string; assets: Asset[];
};
type Sync = {
  status: string; hasMore: boolean; requestedFields: string[]; unavailableFields: string[]; storedCount: number;
  recordsRead: number; pagesRead: number; warningCode: string | null; lastErrorCode: string | null;
  lastAttemptAt: string | null; lastSuccessAt: string | null; completedAt: string | null; source: string; apiVersion: string;
};
type MediaPage = {
  accountId: string; posts: Post[]; nextCursor: string | null; hasMoreStored: boolean; profileMediaCount: number | null;
  storedCount: number; loadedCount: number; mediaReauthorizationRequired: boolean; sync: Sync;
};
type Account = { id: string; username: string | null; pageName: string | null; status: string; mediaReauthorizationRequired: boolean };
type ConnectionStatus = { configured: boolean; accounts: Account[] };

function CarouselGallery({ post, assets }: { post: Post; assets: Asset[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const safeIndex = Math.min(activeIndex, Math.max(assets.length - 1, 0));
  const asset = assets[safeIndex];
  const assetUrl = asset ? safeMetaMediaUrl(asset.mediaType === "VIDEO" ? asset.thumbnailUrl : asset.mediaUrl ?? asset.thumbnailUrl) : null;
  const galleryId = `publication-carousel-${post.id}`;
  const move = (direction: -1 | 1) => setActiveIndex(index => Math.min(Math.max(index + direction, 0), assets.length - 1));
  const choose = (index: number) => setActiveIndex(index);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft" && safeIndex > 0) { event.preventDefault(); move(-1); }
    if (event.key === "ArrowRight" && safeIndex < assets.length - 1) { event.preventDefault(); move(1); }
    if (event.key === "Home") { event.preventDefault(); choose(0); }
    if (event.key === "End") { event.preventDefault(); choose(assets.length - 1); }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") touchStartX.current = event.clientX;
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch" || touchStartX.current === null) return;
    const delta = event.clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) >= 45) move(delta < 0 ? 1 : -1);
  }

  if (!asset) return null;
  return <div className="publication-carousel" role="region" aria-roledescription="carrossel" aria-label={`Carrossel da publicação ${post.providerMediaId}`}>
    <div id={galleryId} className="publication-carousel-viewport" role="group" aria-roledescription="slide" aria-label={`Item ${safeIndex + 1} de ${assets.length}`} tabIndex={0} onKeyDown={handleKeyDown} onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onPointerCancel={() => { touchStartX.current = null; }}>
      {assetUrl ? <Image src={assetUrl} alt={`Item ${safeIndex + 1} do carrossel do Instagram`} fill sizes="(max-width: 640px) 50vw, (max-width: 900px) 50vw, 33vw" unoptimized loading="lazy" referrerPolicy="no-referrer" draggable={false} /> : <span className="publication-carousel-missing"><Images size={18} /><span>Prévia do item {safeIndex + 1} indisponível</span></span>}
      {safeIndex > 0 && <button className="publication-carousel-arrow previous" type="button" aria-label={`Item anterior, ${safeIndex} de ${assets.length}`} aria-controls={galleryId} onClick={() => move(-1)}><span aria-hidden="true">‹</span></button>}
      {safeIndex < assets.length - 1 && <button className="publication-carousel-arrow next" type="button" aria-label={`Próximo item, ${safeIndex + 2} de ${assets.length}`} aria-controls={galleryId} onClick={() => move(1)}><span aria-hidden="true">›</span></button>}
    </div>
    <div className="publication-carousel-controls" aria-label="Posição no carrossel">
      <div className="publication-carousel-indicators">{assets.map((item, index) => <button key={item.id} type="button" className={`publication-carousel-indicator ${index === safeIndex ? "active" : ""}`} aria-label={`Ir para item ${index + 1} de ${assets.length}`} aria-pressed={index === safeIndex} onClick={() => choose(index)} />)}</div>
      <span className="publication-carousel-position" aria-live="polite">{safeIndex + 1} / {assets.length}</span>
    </div>
  </div>;
}

function safeMetaMediaUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const allowed = ["cdninstagram.com", "fbcdn.net", "fbsbx.com"];
    return url.protocol === "https:" && allowed.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`)) ? url.toString() : null;
  } catch { return null; }
}

function safeInstagramUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["instagram.com", "www.instagram.com"].includes(url.hostname) ? url.toString() : null;
  } catch { return null; }
}

function dateLabel(value: string | null) {
  if (!value) return "Data não informada pela Meta";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(date) : "Data não informada pela Meta";
}

async function getPage(accountId: string, after?: string) {
  const query = after ? `?after=${encodeURIComponent(after)}` : "";
  const response = await fetch(`/api/integrations/meta/accounts/${encodeURIComponent(accountId)}/media${query}`, { credentials: "same-origin", cache: "no-store" });
  const body = await response.json().catch(() => null) as (MediaPage & { code?: string }) | null;
  if (response.status === 400 && body?.code === "media_cursor_invalid") throw new Error("orvia_media_cursor_invalid");
  if (!response.ok || !body) throw new Error("Não foi possível carregar as publicações armazenadas.");
  return body;
}

export function InstagramPublications() {
  const [account, setAccount] = useState<Account | null>(null);
  const [data, setData] = useState<MediaPage | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error" | "unconnected">("loading");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"refresh" | "more" | null>(null);
  const initialSync = useRef(new Set<string>());

  const load = useCallback(async (selected: Account) => {
    const result = await getPage(selected.id);
    setData(result);
    setPhase("ready");
    return result;
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      setPhase("loading");
      try {
        const response = await fetch("/api/integrations/meta/status", { credentials: "same-origin", cache: "no-store" });
        const result = await response.json().catch(() => null) as ConnectionStatus | null;
        if (!response.ok || !result || !Array.isArray(result.accounts)) throw new Error("Não foi possível consultar a conta conectada.");
        const found = result.accounts.find(item => item.status === "connected");
        if (!found) { if (active) setPhase("unconnected"); return; }
        if (!active) return;
        setAccount(found);
        const page = await load(found);
        // A first visit performs one real Graph API read. Later visits use only the persisted snapshot.
        if (page.sync.status === "never_synced" && !initialSync.current.has(found.id)) {
          initialSync.current.add(found.id);
          setBusy("refresh");
          const refreshed = await fetch(`/api/integrations/meta/accounts/${encodeURIComponent(found.id)}/media/sync`, {
            method: "POST", credentials: "same-origin", headers: { "x-csrf-token": csrfToken() },
          });
          const outcome = await refreshed.json().catch(() => null) as { outcome?: string } | null;
          if (!refreshed.ok || !outcome) throw new Error("A Meta não respondeu à primeira consulta. A conexão foi mantida.");
          if (active) await load(found);
        }
      } catch (cause) {
        if (active) { setError(cause instanceof Error ? cause.message : "Falha de comunicação."); setPhase("error"); }
      } finally { if (active) setBusy(null); }
    })();
    return () => { active = false; };
  }, [load]);

  async function refresh() {
    if (!account || busy) return;
    setBusy("refresh"); setError(null);
    try {
      const response = await fetch(`/api/integrations/meta/accounts/${encodeURIComponent(account.id)}/media/sync`, {
        method: "POST", credentials: "same-origin", headers: { "x-csrf-token": csrfToken() },
      });
      const result = await response.json().catch(() => null) as { outcome?: string } | null;
      if (!response.ok || !result) throw new Error("A atualização não foi concluída. Seus dados armazenados foram preservados.");
      const page = await load(account);
      if (result.outcome === "cursor_invalid") setError("A paginação anterior expirou. As publicações armazenadas foram mantidas; tente atualizar novamente.");
      else if (["failed", "rate_limited", "reauthorization_required", "throttled"].includes(result.outcome ?? "")) setError(result.outcome === "throttled" ? "Aguarde alguns instantes antes de tentar novamente. Os dados armazenados continuam disponíveis." : "A Meta não concluiu a atualização. Os dados válidos anteriores continuam disponíveis.");
      setData(page);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha de comunicação."); }
    finally { setBusy(null); }
  }

  async function loadMore() {
    if (!account || !data || busy) return;
    setBusy("more"); setError(null);
    try {
      let cursor = data.nextCursor;
      if (!data.hasMoreStored && data.sync.hasMore) {
        const response = await fetch(`/api/integrations/meta/accounts/${encodeURIComponent(account.id)}/media/load-more`, {
          method: "POST", credentials: "same-origin", headers: { "x-csrf-token": csrfToken() },
        });
        const result = await response.json().catch(() => null) as { outcome?: string } | null;
        if (!response.ok || !result) throw new Error("Não foi possível consultar a próxima página. Os dados existentes foram preservados.");
        if (result.outcome === "cursor_invalid") {
          await load(account);
          setError("A Meta invalidou o cursor. A sincronização foi reiniciada; atualize a lista para continuar.");
          return;
        }
        if (["failed", "rate_limited", "reauthorization_required", "throttled"].includes(result.outcome ?? "")) throw new Error(result.outcome === "throttled" ? "Aguarde um instante antes de carregar a próxima página." : "A próxima página não pôde ser carregada. As publicações já salvas continuam disponíveis.");
        cursor = data.posts.at(-1)?.id ?? null;
      }
      if (!cursor) { await load(account); return; }
      const page = await getPage(account.id, cursor);
      setData(previous => previous ? { ...page, posts: [...previous.posts, ...page.posts.filter(post => !previous.posts.some(existing => existing.id === post.id))], loadedCount: previous.posts.length + page.posts.filter(post => !previous.posts.some(existing => existing.id === post.id)).length } : page);
    } catch (cause) {
      if (cause instanceof Error && cause.message === "orvia_media_cursor_invalid") {
        await load(account).catch(() => undefined);
        setError("A lista mudou. As publicações foram atualizadas; use Atualizar publicações para consultar a Meta novamente.");
      } else setError(cause instanceof Error ? cause.message : "Falha de comunicação.");
    }
    finally { setBusy(null); }
  }

  return <section className="publications-workspace page-enter" aria-labelledby="publications-title">
    <div className="publications-heading">
      <div><span className="eyebrow"><span className="eyebrow-line" /> BIBLIOTECA SOCIAL</span><h1 id="publications-title">Publicações <span>reais</span></h1><p>Conteúdos fornecidos pela conta profissional conectada, consultados na API oficial da Meta.</p></div>
      {account && <button className="publications-refresh" type="button" onClick={() => void refresh()} disabled={busy !== null || phase !== "ready"}><RefreshCw size={15} className={busy === "refresh" ? "spin" : ""} />Atualizar publicações</button>}
    </div>
    {phase === "loading" && <div className="publications-state" role="status"><span className="loader" />Carregando publicações armazenadas…</div>}
    {phase === "error" && <div className="publications-state publications-error" role="alert"><AlertCircle size={18} /><div><strong>Não foi possível abrir as publicações.</strong><p>{error}</p><button className="integration-button" type="button" onClick={() => location.reload()}>Tentar novamente</button></div></div>}
    {phase === "unconnected" && <div className="publications-empty"><span className="publications-empty-icon"><Camera size={20} /></span><h2>Conecte uma conta profissional</h2><p>Depois da autorização, as publicações reais disponibilizadas pela Meta aparecerão aqui.</p><Link className="integration-button primary" href="/configuracoes">Ir para configurações <ArrowUpRight size={14} /></Link></div>}
    {phase === "ready" && data && <>
      <div className="publications-account"><span className="publications-account-icon"><Camera size={16} /></span><div><strong>@{account?.username ?? "conta profissional"}</strong><small>Fonte: Instagram Graph API {data.sync.apiVersion} · última consulta bem-sucedida: {dateLabel(data.sync.lastSuccessAt)}</small></div><span className="publications-live-dot" aria-label="Conta conectada" /></div>
      <div className="publications-counts" aria-label="Contagens de publicações"><div><strong>{data.profileMediaCount === null ? "—" : data.profileMediaCount.toLocaleString("pt-BR")}</strong><span>Total informado no perfil</span><small>Valor retornado pelo snapshot do perfil</small></div><div><strong>{data.storedCount.toLocaleString("pt-BR")}</strong><span>Armazenadas no Orvia</span><small>Itens já recebidos da aresta /media</small></div><div><strong>{data.loadedCount.toLocaleString("pt-BR")}</strong><span>Carregadas nesta lista</span><small>Itens exibidos nesta sessão</small></div></div>
      {data.mediaReauthorizationRequired && <div className="publications-notice error" role="alert"><ShieldAlert size={16} /><span>A autorização precisa ser renovada. Os dados armazenados permanecem disponíveis.</span><Link href="/configuracoes">Revisar conexão</Link></div>}
      {(data.sync.status === "partial" || (data.sync.status === "partial_with_warnings" && data.sync.hasMore)) && <div className="publications-notice" role="status">A sincronização está parcial. Ainda existem páginas da Meta que não foram consultadas.</div>}
      {data.sync.unavailableFields.length > 0 && <div className="publications-notice" role="status">A Meta não disponibilizou alguns campos nesta consulta: {data.sync.unavailableFields.join(", ")}.</div>}
      {data.sync.status === "failed" && <div className="publications-notice error" role="status">A última atualização falhou ({data.sync.lastErrorCode ?? "erro de comunicação"}). O último conjunto válido foi preservado e pode estar desatualizado.</div>}
      {error && <div className="publications-inline-error" role="status">{error}</div>}
      {busy === "refresh" && <div className="publications-progress" role="status"><span className="loader" />Consultando a API oficial da Meta…</div>}
      {data.posts.length > 0 ? <div className="publications-grid">{data.posts.map(post => {
        const lead = post.assets[0];
        const imageUrl = safeMetaMediaUrl(post.mediaType === "CAROUSEL_ALBUM" ? lead?.mediaUrl ?? lead?.thumbnailUrl ?? post.thumbnailUrl : post.mediaType === "VIDEO" ? post.thumbnailUrl ?? post.mediaUrl : post.mediaUrl ?? post.thumbnailUrl);
        const link = safeInstagramUrl(post.permalink);
        const carouselAssets = post.mediaType === "CAROUSEL_ALBUM" ? [...post.assets].sort((left, right) => left.position - right.position) : [];
        return <article className="publication-card" key={post.id}>
          <div className="publication-media">
            {carouselAssets.length > 0 ? <CarouselGallery post={post} assets={carouselAssets} /> : imageUrl ? <Image src={imageUrl} alt={post.mediaType === "VIDEO" ? "Miniatura do vídeo do Instagram" : "Imagem da publicação do Instagram"} fill sizes="(max-width: 640px) 50vw, (max-width: 900px) 50vw, 33vw" unoptimized loading="lazy" referrerPolicy="no-referrer" /> : <span><Images size={22} />Prévia indisponível</span>}
            <span className="publication-type">{post.mediaType === "CAROUSEL_ALBUM" ? `Carrossel · ${post.assets.length || "itens"}` : post.mediaType === "VIDEO" ? "Vídeo" : "Imagem"}</span>
          </div>
          <div className="publication-copy"><div className="publication-date">{dateLabel(post.publishedAt)}{post.mediaProductType ? ` · ${post.mediaProductType}` : ""}</div><p>{post.caption || "Esta publicação não possui legenda disponível."}</p><div className="publication-footer">{link ? <a href={link} target="_blank" rel="noreferrer">Abrir no Instagram <ArrowUpRight size={13} /></a> : <span>Link não disponibilizado</span>}<small>Meta · {dateLabel(post.fetchedAt)}</small></div></div>
        </article>;
      })}</div> : data.mediaReauthorizationRequired ? <div className="publications-empty"><span className="publications-empty-icon"><ShieldAlert size={20} /></span><h2>Renove a autorização da Meta</h2><p>A conexão precisa de uma nova autorização antes de consultar publicações. Nenhum item foi fabricado e o estado anterior foi preservado.</p><Link className="integration-button primary" href="/configuracoes">Revisar conexão <ArrowUpRight size={14} /></Link></div> : data.sync.status === "cursor_invalid" ? <div className="publications-empty"><span className="publications-empty-icon"><AlertCircle size={20} /></span><h2>A paginação precisa ser reiniciada</h2><p>A Meta invalidou o cursor anterior. O conjunto armazenado foi mantido; uma nova atualização pode começar uma sincronização.</p><button className="integration-button primary" type="button" onClick={() => void refresh()} disabled={busy !== null}>Atualizar publicações</button></div> : data.sync.status === "succeeded" ? <div className="publications-empty"><span className="publications-empty-icon"><Images size={20} /></span><h2>Nenhuma publicação foi retornada</h2><p>A consulta real à aresta <code>/media</code> não retornou publicações nesta sincronização. O total informado no perfil é exibido separadamente e não substitui esta consulta.</p><small>Consulta concluída em {dateLabel(data.sync.lastSuccessAt)} · {data.sync.apiVersion}</small></div> : data.sync.status === "partial" || data.sync.status === "partial_with_warnings" ? <div className="publications-empty"><span className="publications-empty-icon"><LoaderCircle size={20} /></span><h2>Sincronização ainda parcial</h2><p>A Meta ainda tem páginas que não foram consultadas. Use “Carregar mais” para continuar, ou mantenha os dados já recebidos.</p></div> : <div className="publications-empty"><span className="publications-empty-icon"><LoaderCircle size={20} /></span><h2>Publicações ainda não sincronizadas</h2><p>Atualize para consultar os dados reais disponíveis na Meta.</p><button className="integration-button primary" type="button" onClick={() => void refresh()} disabled={busy !== null}>Atualizar publicações</button></div>}
      {(data.hasMoreStored || (data.sync.hasMore && !data.mediaReauthorizationRequired)) && <div className="publications-more"><button className="integration-button" type="button" onClick={() => void loadMore()} disabled={busy !== null}>{busy === "more" ? <><span className="button-spinner" />Consultando próxima página…</> : "Carregar mais"}</button><small>{data.sync.hasMore ? "Há páginas ainda não consultadas na Meta." : "Há publicações armazenadas que ainda não foram exibidas."}</small></div>}
      <p className="publications-disclaimer">Esta visualização contém somente metadados e mídias fornecidos pela API oficial. Não exibe Insights nem representa análise de desempenho.</p>
    </>}
  </section>;
}

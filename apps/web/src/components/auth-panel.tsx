"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";
import { authRequest, AuthRequestError } from "@/lib/csrf";

type Mode = "login" | "register" | "resend" | "forgot" | "reset" | "verify";
const copy = {
  login: ["Boas-vindas de volta", "Entre no seu espaço e continue de onde parou."],
  register: ["Seu espaço começa aqui", "Crie sua conta para organizar seu crescimento profissional."],
  resend: ["Confirme seu e-mail", "Informe seu endereço para solicitar um novo link de confirmação."],
  forgot: ["Vamos recuperar seu acesso", "Enviaremos instruções para o e-mail associado à sua conta."],
  reset: ["Escolha uma nova senha", "Use uma senha longa que você ainda não usa em outro lugar."],
  verify: ["Confirme seu e-mail", "Use o botão abaixo para confirmar seu endereço de e-mail."],
} satisfies Record<Mode, string[]>;

export function AuthPanel({ mode, token = "" }: { mode: Mode; token?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [verificationState, setVerificationState] = useState<"ready" | "confirmed" | "expired" | "invalid" | "failed">("ready");
  const submitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true; setError(""); setMessage(""); setBusy(true);
    if (mode === "verify") setVerificationState("ready");
    try {
      if (mode === "login") { await authRequest("login", { email, password }); router.push("/onboarding"); router.refresh(); return; }
      if ((mode === "register" || mode === "reset") && password !== confirmation) throw new Error("As senhas não correspondem.");
      if (mode === "register") await authRequest("register", { email, password });
      if (mode === "resend") await authRequest("resend-verification", { email });
      if (mode === "forgot") await authRequest("forgot-password", { email });
      if (mode === "reset") await authRequest("reset-password", { token, password });
      if (mode === "verify") await authRequest("verify-email", { token });
      if (mode === "verify") setVerificationState("confirmed");
      setMessage(mode === "register" ? "Se o cadastro puder prosseguir, enviaremos uma confirmação para este endereço. A resposta é a mesma quando não há um novo cadastro, para proteger sua privacidade." : mode === "resend" ? "Se o endereço puder ser confirmado, enviaremos um link em instantes." : mode === "forgot" ? "Se houver uma conta verificada para este endereço, enviaremos instruções para redefinir a senha." : mode === "reset" ? "Senha redefinida. Você já pode entrar com a nova senha." : "E-mail confirmado. Você já pode entrar.");
    } catch (cause) {
      if (mode === "verify") {
        const code = cause instanceof AuthRequestError ? cause.code : undefined;
        setVerificationState(code === "token_expired" || code === "token_consumed" ? "expired" : code === "invalid_token" ? "invalid" : "failed");
        if (cause instanceof TypeError) setError("Não foi possível falar com o serviço agora. Verifique sua conexão e tente novamente.");
        else setError(cause instanceof Error ? cause.message : "Não foi possível confirmar agora. Tente novamente.");
      } else setError(cause instanceof Error ? cause.message : "Não foi possível concluir. Tente novamente.");
    }
    finally { submitting.current = false; setBusy(false); }
  }

  async function resendVerification() {
    if (submitting.current) return;
    submitting.current = true;
    setError(""); setBusy(true);
    try { await authRequest("resend-verification", { email }); setMessage("Se este endereço puder ser confirmado, enviaremos um novo link. A resposta é sempre a mesma para proteger sua privacidade."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível reenviar agora."); }
    finally { submitting.current = false; setBusy(false); }
  }

  const hasEmail = mode === "login" || mode === "register" || mode === "resend" || mode === "forgot";
  const hasPassword = mode === "login" || mode === "register" || mode === "reset";
  return <main className="auth-page">
    <Link href="/" className="auth-brand" aria-label="Orvia, início"><span className="brand-mark"><span /></span><span>orvia</span></Link>
    <section className="auth-card" aria-labelledby="auth-title">
      <span className="section-kicker">SEU ESPAÇO PROFISSIONAL</span>
      <h1 id="auth-title">{copy[mode][0]}</h1><p className="auth-intro">{copy[mode][1]}</p>
      {mode === "verify" ? <form onSubmit={submit}>
        {!token && <div className="form-error" role="alert"><p>O link de confirmação está ausente. Solicite um novo link para continuar.</p><Link className="text-link" href="/reenviar-confirmacao">Solicitar novo link</Link></div>}
        {verificationState === "ready" && token && <p className="auth-feedback" role="status">O link só será usado quando você confirmar. Ele é válido por uma hora.</p>}
        {verificationState === "confirmed" && <div className="form-success" role="status"><strong>E-mail confirmado.</strong><p>Sua conta está pronta para entrar.</p><Link className="primary-button auth-verify-action" href="/entrar">Entrar no Orvia</Link></div>}
        {verificationState === "expired" && <div className="form-error" role="alert"><strong>Este link expirou ou já foi utilizado.</strong><p>Se seu e-mail já foi confirmado, entre no sistema. Caso contrário, solicite um novo link.</p><div className="auth-verify-links"><Link className="text-link" href="/entrar">Voltar para entrar</Link><Link className="text-link" href="/reenviar-confirmacao">Solicitar novo link</Link></div></div>}
        {verificationState === "invalid" && <div className="form-error" role="alert"><strong>Este link não é válido ou já foi utilizado.</strong><p>Se seu e-mail já foi confirmado, entre no sistema. Caso contrário, solicite um novo link.</p><div className="auth-verify-links"><Link className="text-link" href="/entrar">Entrar</Link><Link className="text-link" href="/reenviar-confirmacao">Solicitar novo link</Link></div></div>}
        {verificationState === "failed" && <p className="form-error" role="alert">{error || "Não foi possível confirmar agora. Verifique sua conexão e tente novamente."}</p>}
        {verificationState === "ready" && error && <p className="form-error" role="alert">{error}</p>}
        {(verificationState === "ready" || verificationState === "failed") && token && <button className="primary-button" disabled={busy}>{busy ? "Confirmando…" : verificationState === "failed" ? "Tentar novamente" : "Confirmar e-mail"}</button>}
      </form> : <form onSubmit={submit}>
        {hasEmail && <label className="auth-field">E-mail<input type="email" autoComplete="email" required maxLength={320} value={email} onChange={event => setEmail(event.target.value)} /></label>}
        {hasPassword && <label className="auth-field">{mode === "reset" ? "Nova senha" : "Senha"}<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required {...(mode === "login" ? {} : { minLength: 12 })} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} />{mode !== "login" && <small>Use pelo menos 12 caracteres.</small>}</label>}
        {(mode === "register" || mode === "reset") && <label className="auth-field">Confirmar senha<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && mode === "register" ? <div className="form-success auth-register-feedback" role="status">
          <p>{message}</p>
          <p>Se não encontrar uma mensagem, você pode entrar, recuperar seu acesso ou solicitar outro link de confirmação. No ambiente local, consulte o Mailpit para ver as mensagens que foram enviadas.</p>
          <div className="auth-register-actions">
            <Link href="/entrar">Entrar</Link>
            <Link href="/recuperar-acesso">Recuperar senha</Link>
            <button type="button" onClick={() => void resendVerification()} disabled={busy}>{busy ? "Aguarde…" : "Solicitar confirmação"}</button>
          </div>
        </div> : message && <p className="form-success" role="status">{message}</p>}
        <button className="primary-button" disabled={busy}>{busy ? "Aguarde…" : mode === "login" ? "Entrar no Orvia" : mode === "register" ? "Criar conta" : mode === "resend" ? "Reenviar confirmação" : mode === "forgot" ? "Enviar instruções" : "Salvar nova senha"}</button>
      </form>}
      <div className="auth-links">
        {mode === "login" && <><Link href="/recuperar-acesso">Esqueci minha senha</Link><Link href="/reenviar-confirmacao">Não recebi o e-mail de confirmação</Link><span>Primeira vez aqui? <Link href="/cadastro">Criar conta</Link></span></>}
        {mode === "register" && <span>Já tem uma conta? <Link href="/entrar">Entrar</Link></span>}
        {(mode === "resend" || mode === "forgot" || mode === "reset" || mode === "verify") && <Link href="/entrar">Voltar para entrar</Link>}
      </div>
    </section>
    <p className="auth-privacy">Não inclua dados clínicos ou informações que identifiquem pacientes.</p>
  </main>;
}

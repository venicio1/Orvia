import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";

export const ACCOUNT_INSIGHT_METRICS = ["reach"] as const;
export const MEDIA_INSIGHT_METRICS = ["reach", "views", "likes", "comments", "shares", "saved", "total_interactions"] as const;
export type InstagramInsightScope = "account" | "media";
export type InstagramInsightMetric = typeof ACCOUNT_INSIGHT_METRICS[number] | typeof MEDIA_INSIGHT_METRICS[number];
export type InstagramInsightStatus = "succeeded" | "partial" | "failed";

const DEFAULT_COOLDOWN_MS = 15 * 60 * 1000;
const DEFAULT_LEASE_MS = 2 * 60 * 1000;
const SOURCE = "instagram_graph_api";
const ACCOUNT_METRIC_SET = new Set<string>(ACCOUNT_INSIGHT_METRICS);
const MEDIA_METRIC_SET = new Set<string>(MEDIA_INSIGHT_METRICS);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE = /^[a-z0-9_:-]{1,64}$/;

type AccountObservation = { metric: "reach"; value: number; referenceDate: Date };
type MediaObservation = { mediaPostId: string; metric: typeof MEDIA_INSIGHT_METRICS[number]; value: number };
type FinishSyncInput = {
  status: InstagramInsightStatus;
  collectedAt: Date;
  missingMetrics?: string[];
  unavailableMetrics?: Record<string, string>;
  errorCode?: string | null;
  accountMetrics?: AccountObservation[];
  mediaMetrics?: MediaObservation[];
};

function assertDate(value: Date, label: string) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new BadRequestException(`${label} inválida.`);
}

function utcDate(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function assertValue(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new BadRequestException("A métrica deve ser um número inteiro não negativo.");
}

function assertCode(value: string, label: string) {
  if (!CODE.test(value)) throw new BadRequestException(`${label} deve ser um código curto, sem texto livre.`);
}

@Injectable()
export class InstagramInsightsPersistenceService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  async beginSync(userId: string, socialAccountId: string, scope: InstagramInsightScope, apiVersion: string) {
    if (scope !== "account" && scope !== "media") throw new BadRequestException("Escopo de Insights inválido.");
    if (!/^v\d+\.\d+$/.test(apiVersion)) throw new BadRequestException("Versão da Graph API inválida.");
    const account = await this.db.socialAccount.findFirst({
      where: { id: socialAccountId, userId, status: "connected" }, select: { id: true },
    });
    if (!account) throw new NotFoundException("Conta social conectada não encontrada.");

    const state = await this.db.instagramInsightSyncState.upsert({
      where: { socialAccountId_scope: { socialAccountId, scope } },
      create: { userId, socialAccountId, scope, status: "never_synced" },
      update: {},
      select: { id: true },
    });
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + DEFAULT_LEASE_MS);
    const requestedMetrics = scope === "account" ? [...ACCOUNT_INSIGHT_METRICS] : [...MEDIA_INSIGHT_METRICS];
    const run = await this.db.$transaction(async transaction => {
      const claimed = await transaction.instagramInsightSyncState.updateMany({
        where: {
          id: state.id, userId, socialAccountId, scope,
          OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
          AND: [{ OR: [{ nextSyncAt: null }, { nextSyncAt: { lte: now } }] }],
        },
        data: { status: "running", leaseUntil, lastAttemptAt: now, lastErrorCode: null },
      });
      if (claimed.count !== 1) return null;
      const created = await transaction.instagramInsightSyncRun.create({ data: {
        userId, socialAccountId, scope, status: "running", requestedMetrics,
        source: SOURCE, apiVersion, startedAt: now,
      } });
      await transaction.instagramInsightSyncState.update({ where: { id: state.id }, data: { lastRunId: created.id } });
      return created;
    });

    if (run) return { outcome: "started" as const, run };
    const current = await this.db.instagramInsightSyncState.findFirst({ where: { id: state.id, userId, socialAccountId } });
    return current?.leaseUntil && current.leaseUntil > now
      ? { outcome: "in_progress" as const }
      : { outcome: "cooldown" as const, nextSyncAt: current?.nextSyncAt ?? null };
  }

  async finishSync(userId: string, socialAccountId: string, runId: string, input: FinishSyncInput) {
    assertDate(input.collectedAt, "Horário de coleta");
    if (!UUID.test(runId)) throw new BadRequestException("Identificador de sincronização inválido.");
    if (!(["succeeded", "partial", "failed"] as string[]).includes(input.status)) throw new BadRequestException("Estado de sincronização inválido.");
    if (input.errorCode) assertCode(input.errorCode, "Código de erro");

    return this.db.$transaction(async transaction => {
      const run = await transaction.instagramInsightSyncRun.findFirst({
        where: { id: runId, userId, socialAccountId, status: "running" },
      });
      if (!run) throw new ConflictException("Sincronização não está ativa ou não pertence a esta conta.");

      const missingMetrics = input.missingMetrics ?? [];
      const unavailableMetrics = input.unavailableMetrics ?? {};
      const allowedMetrics = run.scope === "account" ? ACCOUNT_METRIC_SET : MEDIA_METRIC_SET;
      if (new Set(missingMetrics).size !== missingMetrics.length) throw new BadRequestException("Lista de métricas ausentes contém duplicatas.");
      for (const metric of missingMetrics) {
        if (!allowedMetrics.has(metric) || !run.requestedMetrics.includes(metric)) throw new BadRequestException("Métrica ausente fora do escopo solicitado.");
      }
      for (const [metric, reason] of Object.entries(unavailableMetrics)) {
        if (!allowedMetrics.has(metric) || !run.requestedMetrics.includes(metric)) throw new BadRequestException("Métrica indisponível fora do escopo solicitado.");
        assertCode(reason, "Motivo de indisponibilidade");
        if (missingMetrics.includes(metric)) throw new BadRequestException("Uma métrica não pode estar ausente e indisponível no mesmo ciclo.");
      }

      const accountMetrics = (input.accountMetrics ?? []).map(item => {
        assertDate(item.referenceDate, "Data de referência");
        return { ...item, referenceDate: utcDate(item.referenceDate) };
      });
      const mediaMetrics = input.mediaMetrics ?? [];
      if ((run.scope === "account" && mediaMetrics.length > 0) || (run.scope === "media" && accountMetrics.length > 0)) {
        throw new BadRequestException("As métricas não correspondem ao escopo da sincronização.");
      }
      const hasObservations = accountMetrics.length > 0 || mediaMetrics.length > 0;
      if (input.status === "failed" && (hasObservations || !input.errorCode)) throw new BadRequestException("Uma falha exige código de erro e não pode incluir observações.");
      if (input.status === "succeeded" && (missingMetrics.length > 0 || Object.keys(unavailableMetrics).length > 0 || input.errorCode)) {
        throw new BadRequestException("Uma sincronização completa não pode conter métricas ausentes, indisponíveis ou erro.");
      }
      if (input.status === "succeeded" && run.scope === "account" && accountMetrics.length === 0) {
        throw new BadRequestException("Uma sincronização de conta completa precisa conter o alcance diário observado.");
      }
      if (input.status === "partial" && missingMetrics.length === 0 && Object.keys(unavailableMetrics).length === 0) {
        throw new BadRequestException("Sincronização parcial precisa registrar métricas ausentes ou indisponíveis.");
      }

      const observations = run.scope === "account" ? accountMetrics : mediaMetrics;
      for (const observation of observations as Array<AccountObservation | MediaObservation>) {
        if (!allowedMetrics.has(observation.metric) || !run.requestedMetrics.includes(observation.metric)) throw new BadRequestException("Métrica fora do escopo solicitado.");
        assertValue(observation.value);
      }
      const observationKeys = observations.map((item: AccountObservation | MediaObservation) => run.scope === "account"
          ? `${item.metric}:${(item as AccountObservation).referenceDate.toISOString().slice(0, 10)}`
        : `${(item as MediaObservation).mediaPostId}:${item.metric}`);
      if (new Set(observationKeys).size !== observationKeys.length) throw new BadRequestException("Observações duplicadas no mesmo ciclo.");

      if (input.status !== "failed" && run.scope === "account") {
        for (const item of accountMetrics) {
          await transaction.instagramAccountInsight.upsert({
            where: { socialAccountId_metric_period_referenceDate: {
              socialAccountId, metric: item.metric, period: "day", referenceDate: item.referenceDate,
            } },
            create: {
              userId, socialAccountId, syncRunId: runId, metric: item.metric, value: item.value,
              period: "day", referenceDate: item.referenceDate, collectedAt: input.collectedAt,
              source: run.source, apiVersion: run.apiVersion,
            },
            update: { syncRunId: runId, value: item.value, collectedAt: input.collectedAt, source: run.source, apiVersion: run.apiVersion },
          });
        }
      }

      if (input.status !== "failed" && run.scope === "media") {
        const postIds = [...new Set(mediaMetrics.map(item => item.mediaPostId))];
        if (postIds.some(id => !UUID.test(id))) throw new BadRequestException("Identificador de publicação inválido.");
        if (postIds.length) {
          const posts = await transaction.instagramMediaPost.findMany({
            where: { id: { in: postIds }, userId, socialAccountId, mediaType: "CAROUSEL_ALBUM" }, select: { id: true },
          });
          if (posts.length !== postIds.length) throw new BadRequestException("As métricas só podem ser vinculadas a publicações CAROUSEL_ALBUM desta conta.");
        }
        for (const item of mediaMetrics) {
          const referenceDate = utcDate(input.collectedAt);
          await transaction.instagramMediaInsight.upsert({
            where: { syncRunId_mediaPostId_metric_period: {
              syncRunId: runId, mediaPostId: item.mediaPostId, metric: item.metric, period: "lifetime",
            } },
            create: {
              userId, socialAccountId, mediaPostId: item.mediaPostId, mediaType: "CAROUSEL_ALBUM", syncRunId: runId,
              metric: item.metric, value: item.value, period: "lifetime",
              referenceDate,
              collectedAt: input.collectedAt, source: run.source, apiVersion: run.apiVersion,
            },
            update: {
              value: item.value, referenceDate, collectedAt: input.collectedAt,
              source: run.source, apiVersion: run.apiVersion,
            },
          });
        }
      }

      const finishedAt = new Date();
      const runUpdated = await transaction.instagramInsightSyncRun.updateMany({
        where: { id: runId, userId, socialAccountId, status: "running" },
        data: {
          status: input.status, missingMetrics, unavailableMetrics, errorCode: input.status === "failed" ? input.errorCode : null, finishedAt,
        },
      });
      if (runUpdated.count !== 1) throw new ConflictException("Sincronização já finalizada.");
      const stateUpdated = await transaction.instagramInsightSyncState.updateMany({
        where: { userId, socialAccountId, scope: run.scope, lastRunId: runId, status: "running" },
        data: {
          status: input.status, leaseUntil: null, nextSyncAt: new Date(finishedAt.getTime() + DEFAULT_COOLDOWN_MS),
          lastSuccessAt: input.status === "failed" ? undefined : finishedAt,
          lastErrorCode: input.status === "failed" ? input.errorCode : null,
        },
      });
      if (stateUpdated.count !== 1) throw new ConflictException("Estado de sincronização mudou durante a gravação.");
      return { status: input.status, runId, finishedAt };
    });
  }

  async readAccountHistory(userId: string, socialAccountId: string, from?: Date, to?: Date) {
    return this.db.instagramAccountInsight.findMany({
      where: { userId, socialAccountId, ...(from || to ? { referenceDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
      orderBy: [{ referenceDate: "desc" }, { metric: "asc" }],
    });
  }

  async readMediaHistory(userId: string, socialAccountId: string, mediaPostId: string) {
    if (!UUID.test(mediaPostId)) throw new BadRequestException("Identificador de publicação inválido.");
    return this.db.instagramMediaInsight.findMany({
      where: { userId, socialAccountId, mediaPostId, mediaType: "CAROUSEL_ALBUM" },
      orderBy: [{ collectedAt: "asc" }, { metric: "asc" }],
    });
  }

  async readSyncStates(userId: string, socialAccountId: string) {
    return this.db.instagramInsightSyncState.findMany({
      where: { userId, socialAccountId }, orderBy: { scope: "asc" },
    });
  }
}

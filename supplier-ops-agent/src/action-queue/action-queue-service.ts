import { createHash } from "node:crypto";

import type { BusinessRecommendedAction, RiskLevel } from "../business-os/types.ts";
import type { RevenuePlayRecord } from "../market-radar/types.ts";
import type { ProductOpsRunOutput, ProductOpsTask } from "../product-ops/types.ts";
import type { SupplierOpsRepository } from "../storage/repository.ts";
import type {
  ActionQueueDecisionInput,
  ActionQueueEditInput,
  ActionQueueEvent,
  ActionQueueEventType,
  ActionQueueInput,
  ActionQueueItem,
  ActionQueuePriority,
  ActionQueueRiskLevel,
  ActionQueueStatus,
  ActionQueueType,
} from "./types.ts";

const TERMINAL_STATUSES = new Set<ActionQueueStatus>(["done", "rejected", "ignored"]);
const OPEN_STATUSES = new Set<ActionQueueStatus>(["new", "accepted", "approved", "edited", "in_progress", "waiting"]);

export type ActionQueueService = {
  enqueue(input: ActionQueueInput, now?: string): Promise<ActionQueueItem>;
  approve(id: string, decision: ActionQueueDecisionInput, now?: string): Promise<ActionQueueItem>;
  edit(id: string, edit: ActionQueueEditInput, now?: string): Promise<ActionQueueItem>;
  reject(id: string, decision: ActionQueueDecisionInput, now?: string): Promise<ActionQueueItem>;
  complete(id: string, decision: ActionQueueDecisionInput, now?: string): Promise<ActionQueueItem>;
  listOpen(limit?: number): Promise<ActionQueueItem[]>;
  listCompleted(limit?: number): Promise<ActionQueueItem[]>;
  listEvents(limit?: number): Promise<ActionQueueEvent[]>;
  exportJson(): Promise<string>;
  exportCsv(): Promise<string>;
};

export function createActionQueueService(repository: SupplierOpsRepository): ActionQueueService {
  return {
    async enqueue(input: ActionQueueInput, now = new Date().toISOString()): Promise<ActionQueueItem> {
      const item = normalizeActionInput(input, now);
      const existing = await repository.findActionQueueItemByDedupeKey?.(item.dedupe_key);

      if (existing) {
        const updated: ActionQueueItem = {
          ...existing,
          source_workflow: item.source_workflow,
          source_agent: item.source_agent,
          action_type: item.action_type,
          priority: item.priority,
          area: item.area,
          title: item.title,
          description: item.description,
          reason: item.reason,
          related_product_handle: item.related_product_handle,
          related_product_title: item.related_product_title,
          related_vendor: item.related_vendor,
          related_collection: item.related_collection,
          related_campaign: item.related_campaign,
          risk_level: item.risk_level,
          owner: item.owner,
          due_date: item.due_date,
          confidence_score: item.confidence_score,
          source_payload: item.source_payload,
          source_reference: item.source_reference,
          occurrence_count: existing.occurrence_count + 1,
          updated_at: now,
          last_seen_at: now,
        };
        await repository.upsertActionQueueItem?.(updated);
        await recordQueueEvent(repository, updated, "deduped", item.source_agent, "Repeated recommendation merged into existing action.", now);
        return updated;
      }

      await repository.upsertActionQueueItem?.(item);
      await recordQueueEvent(repository, item, "created", item.source_agent, "Recommendation added to the shared action queue.", now);
      return item;
    },

    async approve(id: string, decision: ActionQueueDecisionInput, now = new Date().toISOString()): Promise<ActionQueueItem> {
      return updateStatus(repository, id, "approved", "approved", decision, now);
    },

    async edit(id: string, edit: ActionQueueEditInput, now = new Date().toISOString()): Promise<ActionQueueItem> {
      const item = await requireAction(repository, id);
      const updated: ActionQueueItem = {
        ...item,
        ...sanitizeEditUpdates(edit.updates),
        status: "edited",
        updated_at: now,
      };
      await repository.upsertActionQueueItem?.(updated);
      await recordQueueEvent(repository, updated, "edited", edit.actor, edit.note, now);
      return updated;
    },

    async reject(id: string, decision: ActionQueueDecisionInput, now = new Date().toISOString()): Promise<ActionQueueItem> {
      return updateStatus(repository, id, "rejected", "rejected", decision, now);
    },

    async complete(id: string, decision: ActionQueueDecisionInput, now = new Date().toISOString()): Promise<ActionQueueItem> {
      return updateStatus(repository, id, "done", "completed", decision, now);
    },

    async listOpen(limit = 100): Promise<ActionQueueItem[]> {
      const items = (await repository.listActionQueueItems?.(limit * 2)) ?? [];
      return items.filter((item) => OPEN_STATUSES.has(item.status)).slice(0, limit);
    },

    async listCompleted(limit = 100): Promise<ActionQueueItem[]> {
      const direct = await repository.listCompletedActionQueueItems?.(limit);
      if (direct) {
        return direct;
      }
      const items = (await repository.listActionQueueItems?.(limit * 2)) ?? [];
      return items.filter((item) => TERMINAL_STATUSES.has(item.status)).slice(0, limit);
    },

    async listEvents(limit = 100): Promise<ActionQueueEvent[]> {
      return (await repository.recentActionQueueEvents?.(limit)) ?? [];
    },

    async exportJson(): Promise<string> {
      const items = (await repository.listActionQueueItems?.(1000)) ?? [];
      return JSON.stringify(items, null, 2);
    },

    async exportCsv(): Promise<string> {
      const items = (await repository.listActionQueueItems?.(1000)) ?? [];
      const header = [
        "Action Type",
        "Priority",
        "Area",
        "Title",
        "Status",
        "Owner",
        "Due Date",
        "Risk Level",
        "Related Product",
        "Related Collection",
        "Related Campaign",
        "Reason",
      ];
      const rows = items.map((item) =>
        [
          item.action_type,
          item.priority,
          item.area,
          item.title,
          item.status,
          item.owner ?? "",
          item.due_date ?? "",
          item.risk_level,
          item.related_product_title ?? item.related_product_handle ?? "",
          item.related_collection ?? "",
          item.related_campaign ?? "",
          item.reason,
        ].map(csvCell).join(","),
      );
      return [header.join(","), ...rows].join("\n");
    },
  };
}

export function normalizeActionInput(input: ActionQueueInput, now = new Date().toISOString()): ActionQueueItem {
  const normalized: ActionQueueInput = {
    ...input,
    source_workflow: cleanText(input.source_workflow, "manual"),
    source_agent: cleanText(input.source_agent, "Operator"),
    action_type: input.action_type,
    priority: input.priority,
    area: cleanText(input.area, "Operations"),
    title: cleanText(input.title, "Untitled action"),
    description: cleanText(input.description, input.reason || "Review this recommendation."),
    reason: cleanText(input.reason, input.description || "Review this recommendation."),
    risk_level: input.risk_level,
  };
  const dedupeKey = input.dedupe_key ?? buildDedupeKey(normalized);

  return {
    source_workflow: normalized.source_workflow,
    source_agent: normalized.source_agent,
    action_type: normalized.action_type,
    priority: normalized.priority,
    area: normalized.area,
    title: normalized.title,
    description: normalized.description,
    reason: normalized.reason,
    related_product_handle: input.related_product_handle ?? null,
    related_product_title: input.related_product_title ?? null,
    related_vendor: input.related_vendor ?? null,
    related_collection: input.related_collection ?? null,
    related_campaign: input.related_campaign ?? null,
    risk_level: normalized.risk_level,
    owner: input.owner ?? null,
    due_date: input.due_date ?? null,
    confidence_score: input.confidence_score ?? null,
    source_payload: input.source_payload ?? {},
    source_reference: input.source_reference ?? null,
    id: input.id ?? `queue_${shortHash(dedupeKey)}`,
    dedupe_key: dedupeKey,
    status: input.status ?? "new",
    occurrence_count: 1,
    created_at: now,
    updated_at: now,
    last_seen_at: now,
  };
}

export function businessActionToQueueInput(action: BusinessRecommendedAction, sourceReference: string): ActionQueueInput {
  return {
    source_workflow: "daily-command-report",
    source_agent: action.agent_name,
    action_type: action.type,
    priority: riskToPriority(action.risk_level),
    area: areaForAgent(action.agent_name, action.type),
    title: action.title,
    description: action.reason,
    reason: action.reason,
    related_product_handle: action.target?.startsWith("product:") ? action.target.replace(/^product:/, "") : null,
    related_product_title: action.target && !action.target.includes(":") ? action.target : null,
    related_vendor: null,
    related_collection: null,
    related_campaign: action.type === "WRITE" ? action.title : null,
    risk_level: riskToQueueRisk(action.risk_level),
    status: action.approval_status === "approved" ? "approved" : action.approval_status === "rejected" ? "rejected" : "new",
    owner: "LWT",
    due_date: null,
    confidence_score: null,
    source_payload: { action },
    source_reference: sourceReference,
  };
}

export function revenuePlayToQueueInput(play: RevenuePlayRecord, sourceReference: string): ActionQueueInput {
  const product = play.matchedProducts[0];
  return {
    source_workflow: "market-radar",
    source_agent: "BI",
    action_type: revenuePlayActionToQueueType(play.actionType),
    priority: play.confidence === "high" ? "High" : play.confidence === "medium" ? "Medium" : "Low",
    area: play.targetAgent === "campaign" ? "Campaign" : play.targetAgent === "blog" ? "Blog" : "Market Signals",
    title: play.title,
    description: play.explanation,
    reason: `${play.explanation} Inventory: ${play.inventoryContext}. Pricing: ${play.pricingContext}.`,
    related_product_handle: product?.handle ?? null,
    related_product_title: product?.title ?? null,
    related_vendor: product?.vendor ?? null,
    related_collection: null,
    related_campaign: play.actionType === "CAMPAIGN_DRAFT" ? play.title : null,
    risk_level: play.claimWarnings.length ? "Claim Risk" : "Low",
    status: play.status === "APPROVED" ? "approved" : play.status === "DISMISSED" ? "ignored" : "new",
    owner: "LWT",
    due_date: null,
    confidence_score: play.confidence === "high" ? 0.86 : play.confidence === "medium" ? 0.66 : 0.42,
    source_payload: { play },
    source_reference: sourceReference,
  };
}

export function productOpsTaskToQueueInput(task: ProductOpsTask, output: ProductOpsRunOutput): ActionQueueInput {
  return {
    source_workflow: "product-ops",
    source_agent: "Product Ops",
    action_type: task.actionType,
    priority: productOpsPriority(task),
    area: productOpsArea(task),
    title: task.title,
    description: task.detail,
    reason: task.detail,
    related_product_handle: null,
    related_product_title: task.productId ?? task.sku ?? null,
    related_vendor: task.supplierId ?? null,
    related_collection: null,
    related_campaign: null,
    risk_level: productOpsRisk(task),
    status: "new",
    owner: "LWT",
    due_date: null,
    confidence_score: null,
    source_payload: { task, runId: output.runId, promotionStatus: task.promotionStatus },
    source_reference: output.runId,
  };
}

async function updateStatus(
  repository: SupplierOpsRepository,
  id: string,
  status: ActionQueueStatus,
  eventType: ActionQueueEventType,
  decision: ActionQueueDecisionInput,
  now: string,
): Promise<ActionQueueItem> {
  const item = await requireAction(repository, id);
  const updated: ActionQueueItem = {
    ...item,
    status,
    updated_at: now,
  };
  await repository.upsertActionQueueItem?.(updated);
  await recordQueueEvent(repository, updated, eventType, decision.actor, decision.note, now);
  return updated;
}

async function requireAction(repository: SupplierOpsRepository, id: string): Promise<ActionQueueItem> {
  const item = await repository.findActionQueueItemById?.(id);
  if (!item) {
    throw new Error(`Action queue item ${id} was not found`);
  }
  return item;
}

async function recordQueueEvent(
  repository: SupplierOpsRepository,
  item: ActionQueueItem,
  eventType: ActionQueueEventType,
  actor: string,
  note: string,
  now: string,
): Promise<void> {
  const event: ActionQueueEvent = {
    id: `queue_event_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    action_id: item.id,
    event_type: eventType,
    actor: cleanText(actor, "system"),
    note: cleanText(note, `${eventType} action queue item.`),
    created_at: now,
    snapshot: { ...item },
  };
  await repository.recordActionQueueEvent?.(event);
}

function buildDedupeKey(input: ActionQueueInput): string {
  return [
    input.source_workflow,
    input.action_type,
    input.related_product_handle ?? input.related_product_title ?? "",
    input.related_collection ?? "",
    input.related_campaign ?? "",
    input.title,
  ]
    .map((part) => slugify(String(part)))
    .filter(Boolean)
    .join("|");
}

function cleanText(value: string | undefined | null, fallback: string): string {
  const trimmed = String(value ?? "").trim();
  return trimmed || fallback;
}

function shortHash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 14);
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function sanitizeEditUpdates(updates: ActionQueueEditInput["updates"]): ActionQueueEditInput["updates"] {
  const sanitized: ActionQueueEditInput["updates"] = {};
  for (const [key, value] of Object.entries(updates) as Array<[keyof ActionQueueEditInput["updates"], unknown]>) {
    if (value === undefined) {
      continue;
    }
    if (typeof value === "string") {
      sanitized[key] = value.trim() as never;
    } else {
      sanitized[key] = value as never;
    }
  }
  return sanitized;
}

function riskToPriority(risk: RiskLevel): ActionQueuePriority {
  if (risk === "high") return "High";
  if (risk === "medium") return "Medium";
  return "Low";
}

function riskToQueueRisk(risk: RiskLevel): ActionQueueRiskLevel {
  if (risk === "high") return "High";
  if (risk === "medium") return "Medium";
  return "Low";
}

function areaForAgent(agentName: string, actionType: ActionQueueType): string {
  if (/inventory/i.test(agentName)) return "Inventory";
  if (/merchandising/i.test(agentName) || actionType === "PROMOTE") return "Promotion";
  if (/marketing|email|customer/i.test(agentName)) return "Campaign";
  if (/seo|cleanup/i.test(agentName)) return "SEO Cleanup";
  if (/research|bi/i.test(agentName)) return "Market Signals";
  if (/operator/i.test(agentName)) return "Operations";
  return "Review";
}

function revenuePlayActionToQueueType(actionType: RevenuePlayRecord["actionType"]): ActionQueueType {
  if (actionType === "BLOG_DRAFT" || actionType === "CAMPAIGN_DRAFT") return "WRITE";
  if (actionType === "FLOW_SETUP") return "AUTOMATE";
  if (actionType === "PRICING_CHECK") return "REVIEW";
  return "PROMOTE";
}

function productOpsPriority(task: ProductOpsTask): ActionQueuePriority {
  if (task.promotionStatus === "DO_NOT_PROMOTE" || task.promotionStatus === "REVIEW_REQUIRED") return "High";
  if (task.promotionStatus === "OUT_OF_STOCK" || task.promotionStatus === "LOW_STOCK") return "Medium";
  return task.actionType === "PROMOTE" ? "High" : "Medium";
}

function productOpsArea(task: ProductOpsTask): string {
  if (/stock|inventory|supplier/i.test(task.title + " " + task.detail)) return "Inventory";
  if (task.actionType === "PROMOTE") return "Promotion";
  if (task.actionType === "WRITE") return "Content";
  return "Product Ops";
}

function productOpsRisk(task: ProductOpsTask): ActionQueueRiskLevel {
  if (task.promotionStatus === "DO_NOT_PROMOTE" || task.promotionStatus === "REVIEW_REQUIRED") return "High";
  if (task.promotionStatus === "LOW_STOCK" || task.promotionStatus === "OUT_OF_STOCK") return "Medium";
  return "Low";
}

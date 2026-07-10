import type { SupplierOpsRepository } from "../storage/repository.ts";
import type { ActionItem, ShopperRecommendation, WeeklyBriefRecord } from "./intelligenceTypes.ts";

export type IntelligenceExportKind = "actions" | "weekly-briefs" | "shopper-recommendations";
export type IntelligenceExportFormat = "csv" | "json" | "markdown";

export type IntelligenceExportResult = {
  body: string;
  contentType: string;
  filename: string;
};

export async function buildIntelligenceExport(
  repository: SupplierOpsRepository,
  kind: IntelligenceExportKind,
  format: IntelligenceExportFormat,
): Promise<IntelligenceExportResult> {
  if (kind === "actions") {
    return actionExport(await repository.recentActionItems({ limit: 500 }), format);
  }
  if (kind === "weekly-briefs") {
    return weeklyBriefExport(await repository.recentWeeklyBriefs({ limit: 20 }), format);
  }
  return shopperRecommendationExport(await repository.recentShopperRecommendations({ limit: 500 }), format);
}

function actionExport(items: ActionItem[], format: IntelligenceExportFormat): IntelligenceExportResult {
  if (format === "json") {
    return jsonExport("lwt-action-queue.json", { generatedAt: new Date().toISOString(), items });
  }
  return {
    filename: "lwt-action-queue.csv",
    contentType: "text/csv; charset=utf-8",
    body: csv(
      ["id", "title", "source", "priority", "status", "recommendation_type", "related_product_title", "related_topic", "owner", "created_at", "updated_at", "completed_at", "suggested_action"],
      items.map((item) => [
        item.id,
        item.title,
        item.source,
        item.priority,
        item.status,
        item.recommendationType,
        item.relatedProductTitle ?? "",
        item.relatedTopic ?? "",
        item.owner ?? "",
        item.createdAt,
        item.updatedAt,
        item.completedAt ?? "",
        item.suggestedAction,
      ]),
    ),
  };
}

function weeklyBriefExport(items: WeeklyBriefRecord[], format: IntelligenceExportFormat): IntelligenceExportResult {
  if (format === "json") {
    return jsonExport("lwt-weekly-briefs.json", { generatedAt: new Date().toISOString(), items });
  }
  return {
    filename: "lwt-weekly-briefs.md",
    contentType: "text/markdown; charset=utf-8",
    body: items.length ? items.map((brief) => `<!-- generated_at: ${brief.generatedAt} -->\n${brief.markdown}`).join("\n\n---\n\n") : "# LWT Weekly Operator Brief\n\nNo weekly briefs have been generated yet.",
  };
}

function shopperRecommendationExport(items: ShopperRecommendation[], format: IntelligenceExportFormat): IntelligenceExportResult {
  if (format === "json") {
    return jsonExport("lwt-shopper-recommendations.json", { generatedAt: new Date().toISOString(), items });
  }
  return {
    filename: "lwt-shopper-recommendations.csv",
    contentType: "text/csv; charset=utf-8",
    body: csv(
      ["id", "title", "priority", "status", "recommendation_type", "related_term", "related_product_title", "source", "date_range", "created_at", "suggested_action"],
      items.map((item) => [
        item.id,
        item.title,
        item.priority,
        item.status,
        item.recommendationType,
        item.relatedTerm ?? "",
        item.relatedProductTitle ?? "",
        item.source ?? "",
        item.dateRange ?? "",
        item.createdAt,
        item.suggestedAction ?? "",
      ]),
    ),
  };
}

function jsonExport(filename: string, payload: unknown): IntelligenceExportResult {
  return {
    filename,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(payload, null, 2),
  };
}

function csv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((row) => row.map(csvValue).join(",")).join("\n");
}

function csvValue(value: string): string {
  if (!/[",\n\r]/.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '""')}"`;
}

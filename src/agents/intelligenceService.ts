import type { SupplierOpsRepository } from "../storage/repository.ts";
import {
  addActionNote as addActionNoteToQueue,
  createActionFromRecommendation as createQueuedActionFromRecommendation,
  createActionItem as createQueuedActionItem,
  listActionQueue,
  updateActionItem as updateQueuedActionItem,
  type CreateActionFromRecommendationInput,
  type CreateActionItemInput,
} from "./actionQueueService.ts";
import { generateBlogBriefMarkdown } from "./blogBriefAgent.ts";
import { buildConnectorStatuses } from "./contentRadarAgent.ts";
import { runContentRadarAgent } from "./contentRadarAgent.ts";
import { runDailyBiAgent } from "./dailyBiAgent.ts";
import { runInventoryAgent } from "./inventoryAgent.ts";
import { parsePreviewedBehaviorImport, previewBehaviorImport, type BehaviorImportContentInput } from "./reportColumnMapper.ts";
import { runProductStrategyAgent } from "./productStrategyAgent.ts";
import {
  buildShopperBehaviorResult,
  buildShopperBehaviorSourceStatuses,
  emptyShopperBehaviorResult,
  importShopperBehaviorReports,
  runShopperBehaviorAgent,
} from "./shopperBehaviorAgent.ts";
import { generateWeeklyBriefMarkdown } from "./weeklyBriefAgent.ts";
import type {
  ActionItemPriority,
  ActionItemSource,
  ActionItemStatus,
  ContentIdeaStatus,
  ContentRadarSourceSettings,
  ContentRadarResult,
  DailyBiResult,
  IntelligenceDashboard,
  IntelligenceRunRecord,
  IntelligenceRunType,
  InventoryAgentResult,
  ProductStrategyResult,
  ShopperBehaviorResult,
  ShopperRecommendationStatus,
  ShopifyVariantProvider,
  SourceConfig,
} from "./intelligenceTypes.ts";

export type IntelligenceService = ReturnType<typeof createIntelligenceService>;

export type CreateIntelligenceServiceInput = {
  repository: SupplierOpsRepository;
  sourceConfig: SourceConfig;
  topics: string[];
  listShopifyVariants?: ShopifyVariantProvider;
  radarSettings?: ContentRadarSourceSettings;
  behaviorImportDirectory?: string;
};

export function createIntelligenceService(input: CreateIntelligenceServiceInput) {
  const radarSettings = withRadarSettingsDefaults(input.radarSettings, input.topics);

  return {
    async getSources() {
      const statuses = buildConnectorStatuses(input.sourceConfig);
      const runs = await input.repository.recentIntelligenceRuns({ limit: 20 }).catch(() => []);
      for (const key of Object.keys(statuses) as Array<keyof typeof statuses>) {
        const relatedRun = lastRelatedRun(key, runs);
        statuses[key].lastRunAt = relatedRun?.finishedAt ?? null;
        if (relatedRun?.status === "failed" && relatedRun.error) {
          statuses[key].status = "error";
          statuses[key].error = relatedRun.error;
        }
      }
      return statuses;
    },

    async getInventory(): Promise<InventoryAgentResult> {
      const latest = await latestSummary<InventoryAgentResult>(input.repository, "inventory");
      return latest ?? emptyInventoryResult();
    },

    async getProductStrategy(): Promise<ProductStrategyResult> {
      const latest = await latestSummary<ProductStrategyResult>(input.repository, "product_strategy");
      return latest ?? emptyProductStrategyResult();
    },

    async getContentRadar(): Promise<Pick<ContentRadarResult, "sourceItems" | "ideas" | "errors" | "generatedAt">> {
      const [sourceItems, ideas, latest] = await Promise.all([
        input.repository.recentSourceItems({ limit: 30 }).catch(() => []),
        input.repository.recentContentIdeas({ limit: 30 }).catch(() => []),
        latestSummary<ContentRadarResult>(input.repository, "content_radar"),
      ]);
      return {
        generatedAt: latest?.generatedAt ?? new Date().toISOString(),
        sourceItems: sourceItems.length ? sourceItems : latest?.sourceItems ?? [],
        ideas: ideas.length ? ideas : latest?.ideas ?? [],
        errors: latest?.errors ?? [],
      };
    },

    async getDailyBi(): Promise<DailyBiResult> {
      const latest = await latestSummary<DailyBiResult>(input.repository, "daily_bi");
      return latest ?? emptyDailyBiResult();
    },

    async getShopperBehavior(): Promise<ShopperBehaviorResult> {
      const [latest, imports, recommendations, searchTerms, productSignals] = await Promise.all([
        latestSummary<ShopperBehaviorResult>(input.repository, "shopper_behavior"),
        input.repository.recentShopperBehaviorImports({ limit: 20 }).catch(() => []),
        input.repository.recentShopperRecommendations({ limit: 100 }).catch(() => []),
        input.repository.recentShopperSearchTerms({ limit: 100 }).catch(() => []),
        input.repository.recentShopperProductSignals({ limit: 100 }).catch(() => []),
      ]);
      if (searchTerms.length || productSignals.length || recommendations.length || imports.length) {
        return buildShopperBehaviorResult({
          sourceConfig: input.sourceConfig,
          searchTerms,
          productSignals,
          imports,
          recommendations,
          contentOpportunities: recommendations.filter((recommendation) => recommendation.recommendationType === "blog_topic_opportunity"),
          errors: latest?.errors ?? [],
        });
      }
      if (!latest) {
        return emptyShopperBehaviorResult(input.sourceConfig, imports);
      }
      return {
        ...latest,
        imports: imports.length ? imports : latest.imports,
        sources: buildShopperBehaviorSourceStatuses(input.sourceConfig, imports.length ? imports : latest.imports),
        recommendations: recommendations.length ? recommendations : latest.recommendations,
        contentOpportunities: recommendations.length
          ? recommendations.filter((recommendation) => recommendation.recommendationType === "blog_topic_opportunity")
          : latest.contentOpportunities,
      };
    },

    async getShopperBehaviorSources() {
      const imports = await input.repository.recentShopperBehaviorImports({ limit: 20 }).catch(() => []);
      return buildShopperBehaviorSourceStatuses(input.sourceConfig, imports);
    },

    async getShopperBehaviorRecommendations(status?: ShopperRecommendationStatus) {
      return input.repository.recentShopperRecommendations({ status, limit: 100 }).catch(() => []);
    },

    async importShopperBehaviorReports() {
      if (!input.behaviorImportDirectory) {
        return [];
      }
      return importShopperBehaviorReports(input.repository, input.behaviorImportDirectory);
    },

    async previewShopperBehaviorImport(importInput: BehaviorImportContentInput) {
      return previewBehaviorImport(importInput);
    },

    async confirmShopperBehaviorImport(importInput: BehaviorImportContentInput) {
      const { preview, parsed } = parsePreviewedBehaviorImport(importInput);
      const record = await input.repository.createShopperBehaviorImport({
        source: preview.source,
        importType: preview.importType,
        filename: importInput.filename,
        metadataJson: {
          importMode: "ui_upload",
          reportType: preview.reportType,
          columnMapping: preview.mappedColumns,
        },
      });

      try {
        await input.repository.saveBehaviorImportMapping({
          reportType: preview.reportType,
          source: preview.source,
          importType: preview.importType,
          filename: importInput.filename,
          columnMapping: preview.mappedColumns,
          missingColumns: preview.missingColumns,
        });
        const [searchTerms, productSignals] = await Promise.all([
          input.repository.saveShopperSearchTerms(parsed.searchTerms),
          input.repository.saveShopperProductSignals(parsed.productSignals),
        ]);
        const importRecord = await input.repository.completeShopperBehaviorImport(record.id, {
          status: "completed",
          rowCount: preview.rowCount,
          metadataJson: {
            importMode: "ui_upload",
            reportType: preview.reportType,
            columnMapping: preview.mappedColumns,
            parsedSearchTerms: searchTerms.length,
            parsedProductSignals: productSignals.length,
          },
        });
        const behavior = await runShopperBehaviorAgent({
          repository: input.repository,
          sourceConfig: input.sourceConfig,
          listShopifyVariants: input.listShopifyVariants,
        }).catch(() => undefined);
        return { preview, importRecord, searchTerms, productSignals, behavior };
      } catch (error) {
        await input.repository.completeShopperBehaviorImport(record.id, {
          status: "failed",
          error: error instanceof Error ? error.message : "Import failed",
        });
        throw error;
      }
    },

    async listActionItems(filters: { source?: ActionItemSource; priority?: ActionItemPriority; status?: ActionItemStatus; limit?: number } = {}) {
      return listActionQueue(input.repository, filters);
    },

    async createActionItem(actionInput: CreateActionItemInput) {
      return createQueuedActionItem(input.repository, actionInput);
    },

    async createActionFromRecommendation(actionInput: CreateActionFromRecommendationInput) {
      return createQueuedActionFromRecommendation(input.repository, actionInput);
    },

    async updateActionItem(id: string, actionInput: Parameters<typeof updateQueuedActionItem>[2]) {
      return updateQueuedActionItem(input.repository, id, actionInput);
    },

    async addActionNote(actionId: string, body: string) {
      return addActionNoteToQueue(input.repository, actionId, body);
    },

    async generateWeeklyBrief() {
      const dashboard = await this.getDashboard();
      const actionQueue = await listActionQueue(input.repository, { limit: 100 });
      const markdown = generateWeeklyBriefMarkdown({ dashboard, actionQueue });
      return input.repository.saveWeeklyBrief({
        markdown,
        metadataJson: {
          actionSummary: actionQueue.summary,
          generatedBy: "weekly_brief_agent",
        },
      });
    },

    async getWeeklyBrief() {
      const latest = (await input.repository.recentWeeklyBriefs({ limit: 1 }).catch(() => []))[0];
      if (latest) {
        return latest;
      }
      return this.generateWeeklyBrief();
    },

    async getSummary() {
      const dashboard = await this.getDashboard();
      return dashboard.summaryCards;
    },

    async getContentIdea(id: string) {
      return input.repository.getContentIdea(id);
    },

    async getDashboard(): Promise<IntelligenceDashboard> {
      const [inventory, productStrategy, contentRadar, dailyBi, sources, shopperBehavior, actionQueue] = await Promise.all([
        this.getInventory(),
        this.getProductStrategy(),
        this.getContentRadar(),
        this.getDailyBi(),
        this.getSources(),
        this.getShopperBehavior(),
        listActionQueue(input.repository, { limit: 100 }),
      ]);
      const inventoryRisks =
        inventory.alerts.lowStock.length + inventory.alerts.outOfStock.length + inventory.alerts.highVelocityLowStock.length + inventory.alerts.staleStock.length;
      const errors = contentRadar.errors;

      return {
        summaryCards: {
          inventoryRisks,
          salesSignal: dailyBi.salesSignal,
          productOpportunities: productStrategy.suggestedPushes.length,
          contentIdeas: contentRadar.ideas.length,
        },
        today: {
          brief: dailyBi.brief,
          actionItems: dailyBi.actionItems,
          inventoryAlerts: dailyBi.inventoryAlerts,
          recommendations: dailyBi.recommendations,
          lastSuccessfulScanTime: dailyBi.lastSuccessfulScanTime,
          shopperBehavior: shopperBehavior.todaySummary,
          actionQueue: {
            topOpenActions: actionQueue.items.filter((item) => item.status !== "done" && item.status !== "rejected").slice(0, 3),
            summaryText: `${actionQueue.summary.openActions} open actions, ${actionQueue.summary.criticalActions} critical, ${actionQueue.summary.highPriorityActions} high priority.`,
          },
          reportData: reportDataSummary(shopperBehavior),
        },
        inventory: {
          ...inventory.alerts,
          vendorSummary: inventory.vendorSummary,
        },
        productStrategy,
        contentRadar: {
          sourceItems: contentRadar.sourceItems,
          ideas: contentRadar.ideas,
        },
        shopperBehavior,
        actionQueue,
        sources,
        sourceSettings: radarSettings,
        errors,
      };
    },

    async updateContentIdeaStatus(id: string, status: ContentIdeaStatus) {
      return input.repository.updateContentIdeaStatus(id, status);
    },

    async generateBlogBrief(id: string) {
      const idea = await input.repository.getContentIdea(id);
      if (!idea) {
        throw new Error(`Content idea ${id} was not found`);
      }
      return {
        idea,
        markdown: generateBlogBriefMarkdown(idea),
      };
    },

    async run(type: IntelligenceRunType) {
      const run = await input.repository.createIntelligenceRun({ type });
      try {
        const result = await runAgent(type, input);
        await input.repository.completeIntelligenceRun(run.id, {
          status: "completed",
          summaryJson: result as Record<string, unknown>,
        });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown intelligence run failure";
        await input.repository.completeIntelligenceRun(run.id, {
          status: "failed",
          error: message,
          summaryJson: { error: message },
        });
        throw error;
      }
    },
  };
}

async function runAgent(type: IntelligenceRunType, input: CreateIntelligenceServiceInput) {
  if (type === "inventory") {
    const result = await runInventoryAgent({
      repository: input.repository,
      listShopifyVariants: input.listShopifyVariants,
    });
    await input.repository.saveProductSignals(result.signals);
    return result;
  }
  if (type === "content_radar") {
    return runContentRadarAgent({
      repository: input.repository,
      topics: input.topics,
      sourceConfig: input.sourceConfig,
      radarSettings: input.radarSettings,
    });
  }
  if (type === "daily_bi") {
    return runDailyBiAgent({ repository: input.repository });
  }
  if (type === "shopper_behavior") {
    return runShopperBehaviorAgent({
      repository: input.repository,
      sourceConfig: input.sourceConfig,
      importDirectory: input.behaviorImportDirectory,
      listShopifyVariants: input.listShopifyVariants,
    });
  }
  return runProductStrategyAgent({ repository: input.repository });
}

export function withRadarSettingsDefaults(
  settings: ContentRadarSourceSettings | undefined,
  topics: string[],
): ContentRadarSourceSettings {
  const topicClusters = normalizedList(settings?.topicClusters).length ? normalizedList(settings?.topicClusters) : normalizedList(topics);
  return {
    topicClusters,
    keywords: normalizedList(settings?.keywords),
    excludedTerms: normalizedList(settings?.excludedTerms),
    subreddits: normalizedList(settings?.subreddits).length ? normalizedList(settings?.subreddits) : ["Supplements"],
    xQueries: normalizedList(settings?.xQueries),
    searchQueries: normalizedList(settings?.searchQueries),
    scanFrequencyNotes: settings?.scanFrequencyNotes?.trim() || "Manual fallback runs on demand; configure official connectors before relying on live source scans.",
    listeningSeeds: settings?.listeningSeeds ?? [],
  };
}

function normalizedList(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

async function latestSummary<T>(repository: SupplierOpsRepository, type: IntelligenceRunType): Promise<T | null> {
  const runs = await repository.recentIntelligenceRuns({ type, limit: 1 }).catch(() => []);
  const latest = runs.find((run) => run.status === "completed");
  return latest ? (latest.summaryJson as T) : null;
}

function lastRelatedRun(key: "shopify" | "x" | "reddit" | "search", runs: IntelligenceRunRecord[]): IntelligenceRunRecord | undefined {
  if (key === "shopify") {
    return runs.find((run) => run.type === "inventory" || run.type === "daily_bi" || run.type === "product_strategy");
  }
  return runs.find((run) => run.type === "content_radar");
}

function emptyInventoryResult(): InventoryAgentResult {
  return {
    generatedAt: new Date().toISOString(),
    brief: "Inventory data is not available yet. Run Inventory Scan after Shopify is configured.",
    actionItems: ["Run Inventory Scan to populate low-stock and out-of-stock alerts."],
    alerts: {
      lowStock: [],
      outOfStock: [],
      highVelocityLowStock: [],
      staleStock: [],
    },
    vendorSummary: [],
    signals: [],
    sourceProductCount: 0,
    dataNotes: ["No inventory intelligence run has completed yet."],
  };
}

function emptyProductStrategyResult(): ProductStrategyResult {
  return {
    generatedAt: new Date().toISOString(),
    topMovingProducts: [],
    stockButLowMovement: [],
    movementButLowStock: [],
    brandsOrCategoriesToFeature: [],
    suggestedPushes: ["Run Product Strategy after Inventory Scan and Content Radar complete."],
    explanations: ["Product strategy will combine inventory risk and content topics after the first run."],
  };
}

function emptyDailyBiResult(): DailyBiResult {
  return {
    generatedAt: new Date().toISOString(),
    brief: "No intelligence runs yet.",
    actionItems: ["Run Inventory Scan and Content Radar to build today's brief."],
    inventoryAlerts: [],
    recommendations: [],
    lastSuccessfulScanTime: null,
    salesSignal: "Setup needed",
  };
}

function reportDataSummary(shopperBehavior: ShopperBehaviorResult): IntelligenceDashboard["today"]["reportData"] {
  const latestImport = shopperBehavior.imports.find((record) => record.finishedAt);
  if (latestImport?.finishedAt) {
    return {
      lastImportAt: latestImport.finishedAt,
      mode: "manual_reports",
      description: `Manual report data used. Last import: ${latestImport.filename}.`,
    };
  }
  return {
    lastImportAt: null,
    mode: "no_report_data",
    description: "No manual report data has been imported yet; missing analytics connectors remain in graceful fallback mode.",
  };
}

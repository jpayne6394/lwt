import type { ShopifyVariant } from "../domain/types.ts";

export type IntelligenceRunType = "inventory" | "daily_bi" | "product_strategy" | "content_radar" | "shopper_behavior";
export type IntelligenceRunStatus = "running" | "completed" | "failed";

export type PriorityLabel = "Critical" | "Watch" | "Normal";
export type ComplianceRisk = "Low" | "Medium" | "High";
export type ContentIdeaStatus = "idea" | "approved" | "drafted" | "rejected";
export type SourceName = "shopify" | "x" | "reddit" | "google_trends" | "manual";
export type ConnectorKey = "shopify" | "x" | "reddit" | "search";
export type ConnectorState = "connected" | "not_configured" | "error";
export type ShopperBehaviorSourceKey =
  | "shopify"
  | "shopify_search_discovery_import"
  | "shopify_analytics_import"
  | "ga4"
  | "search_console"
  | "manual_import";
export type ShopperBehaviorImportSource =
  | "shopify_search_discovery"
  | "shopify_analytics"
  | "ga4"
  | "search_console"
  | "manual_import";
export type ShopperBehaviorImportType = "search_terms" | "product_engagement";
export type ShopperRecommendationStatus = "open" | "accepted" | "rejected" | "done";
export type ShopperBehaviorReportType =
  | "shopify_search_terms"
  | "shopify_no_result_searches"
  | "shopify_product_engagement"
  | "ga4_site_search"
  | "ga4_landing_product_engagement"
  | "search_console_queries"
  | "generic_shopper_behavior_csv";
export type BehaviorImportMappedField =
  | "term"
  | "searchCount"
  | "clickCount"
  | "purchaseCount"
  | "noResultsCount"
  | "noClickCount"
  | "productTitle"
  | "shopifyProductId"
  | "views"
  | "addToCarts"
  | "dateRange";
export type BehaviorImportColumnMapping = Partial<Record<BehaviorImportMappedField, string>>;
export type ActionItemSource = "inventory" | "product_strategy" | "content_radar" | "shopper_behavior" | "blog_brief" | "manual";
export type ActionItemPriority = "critical" | "high" | "medium" | "low";
export type ActionItemStatus = "open" | "planned" | "in_progress" | "done" | "rejected";

export type IntelligenceRunRecord = {
  id: string;
  type: IntelligenceRunType;
  startedAt: string;
  finishedAt: string | null;
  status: IntelligenceRunStatus;
  error: string | null;
  summaryJson: Record<string, unknown>;
};

export type SourceItem = {
  id: string;
  source: SourceName;
  sourceUrl?: string;
  sourceAuthorOrSubreddit?: string;
  title: string;
  textExcerpt: string;
  collectedAt: string;
  scoreJson: Record<string, unknown>;
  rawJson?: Record<string, unknown>;
};

export type ProductSignal = {
  id: string;
  shopifyProductId?: string;
  productTitle: string;
  vendor?: string;
  category?: string;
  signalType: string;
  priority: PriorityLabel;
  reason: string;
  createdAt: string;
};

export type ContentIdea = {
  id: string;
  topic: string;
  sourceSummary: string;
  suggestedTitle: string;
  productTieIn: string;
  complianceRisk: ComplianceRisk;
  complianceReason?: string;
  saferAngle?: string;
  suggestedCta: string;
  status: ContentIdeaStatus;
  createdAt: string;
};

export type ConnectorStatus = {
  label: string;
  status: ConnectorState;
  missingEnvVars: string[];
  lastRunAt?: string | null;
  error?: string;
  message?: string;
};

export type ConnectorStatusMap = Record<ConnectorKey, ConnectorStatus>;

export type SourceConfig = {
  shopifyStoreDomain?: string;
  shopifyAdminAccessToken?: string;
  xBearerToken?: string;
  redditClientId?: string;
  redditClientSecret?: string;
  redditUserAgent?: string;
  searchProviderKey?: string;
  googleTrendsProviderKey?: string;
  searchProviderUrl?: string;
  ga4PropertyId?: string;
  ga4CredentialsJson?: string;
  searchConsoleSiteUrl?: string;
  searchConsoleCredentialsJson?: string;
  internalDashboardPassword?: string;
};

export type ShopperBehaviorImportRecord = {
  id: string;
  source: ShopperBehaviorImportSource;
  importType: ShopperBehaviorImportType;
  filename: string;
  startedAt: string;
  finishedAt: string | null;
  status: IntelligenceRunStatus;
  error: string | null;
  rowCount: number;
  metadataJson: Record<string, unknown>;
};

export type BehaviorImportMappingRecord = {
  id: string;
  reportType: ShopperBehaviorReportType;
  source: ShopperBehaviorImportSource;
  importType: ShopperBehaviorImportType;
  filename: string;
  columnMapping: BehaviorImportColumnMapping;
  missingColumns: string[];
  createdAt: string;
};

export type BehaviorImportPreviewRow = {
  term?: string;
  searchCount?: number;
  clickCount?: number;
  purchaseCount?: number;
  noResultsCount?: number;
  noClickCount?: number;
  productTitle?: string;
  shopifyProductId?: string;
  views?: number;
  addToCarts?: number;
  dateRange?: string;
};

export type BehaviorImportPreview = {
  valid: boolean;
  reportType: ShopperBehaviorReportType;
  source: ShopperBehaviorImportSource;
  importType: ShopperBehaviorImportType;
  filename: string;
  rowCount: number;
  mappedColumns: BehaviorImportColumnMapping;
  missingColumns: string[];
  sampleRows: BehaviorImportPreviewRow[];
  errors: string[];
  operatorMessage: string;
};

export type ActionItem = {
  id: string;
  title: string;
  source: ActionItemSource;
  priority: ActionItemPriority;
  status: ActionItemStatus;
  recommendationType: string;
  relatedProductId?: string;
  relatedProductTitle?: string;
  relatedTopic?: string;
  explanation: string;
  suggestedAction: string;
  owner?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type ActionNote = {
  id: string;
  actionId: string;
  body: string;
  createdAt: string;
};

export type ActionQueueSummary = {
  openActions: number;
  criticalActions: number;
  highPriorityActions: number;
  doneThisWeek: number;
  rejectedActions: number;
};

export type ActionQueueResult = {
  summary: ActionQueueSummary;
  items: ActionItem[];
};

export type WeeklyBriefRecord = {
  id: string;
  generatedAt: string;
  markdown: string;
  metadataJson: Record<string, unknown>;
};

export type ShopperSearchTerm = {
  id: string;
  term: string;
  normalizedTerm: string;
  source: ShopperBehaviorImportSource;
  searchCount: number;
  clickCount?: number;
  purchaseCount?: number;
  noResultsCount?: number;
  noClickCount?: number;
  firstSeenAt: string;
  lastSeenAt: string;
  scoreJson: Record<string, unknown>;
  createdAt: string;
  dateRange?: string;
};

export type ShopperProductSignal = {
  id: string;
  shopifyProductId?: string;
  productTitle: string;
  signalType: string;
  metricName: string;
  metricValue: number;
  priority: PriorityLabel;
  reason: string;
  createdAt: string;
  source?: ShopperBehaviorImportSource;
  dateRange?: string;
};

export type ShopperRecommendation = {
  id: string;
  recommendationType: string;
  title: string;
  explanation: string;
  relatedTerm?: string;
  relatedProductId?: string;
  relatedProductTitle?: string;
  priority: PriorityLabel;
  status: ShopperRecommendationStatus;
  createdAt: string;
  source?: ShopperBehaviorImportSource | "behavior_recommendation_engine";
  dateRange?: string;
  suggestedAction?: string;
};

export type ShopperBehaviorSourceStatus = {
  label: string;
  status: ConnectorState;
  missingEnvVars: string[];
  lastImportAt?: string | null;
  lastRunAt?: string | null;
  error?: string;
  message?: string;
};

export type ShopperBehaviorSourceStatusMap = Record<ShopperBehaviorSourceKey, ShopperBehaviorSourceStatus>;

export type ContentRadarSourceSettings = {
  topicClusters: string[];
  keywords: string[];
  excludedTerms: string[];
  subreddits: string[];
  xQueries: string[];
  searchQueries: string[];
  scanFrequencyNotes: string;
};

export type InventoryRiskItem = {
  productId: string;
  variantId: string;
  title: string;
  vendor: string;
  category?: string;
  sku?: string;
  quantity: number | null;
  priority: PriorityLabel;
  reason: string;
};

export type VendorInventorySummary = {
  vendor: string;
  critical: number;
  watch: number;
  normal: number;
};

export type InventoryAgentResult = {
  generatedAt: string;
  brief: string;
  actionItems: string[];
  alerts: {
    lowStock: InventoryRiskItem[];
    outOfStock: InventoryRiskItem[];
    highVelocityLowStock: InventoryRiskItem[];
    staleStock: InventoryRiskItem[];
  };
  vendorSummary: VendorInventorySummary[];
  signals: ProductSignal[];
  sourceProductCount: number;
  dataNotes: string[];
};

export type ContentRadarResult = {
  generatedAt: string;
  connectorStatuses: ConnectorStatusMap;
  sourceItems: SourceItem[];
  ideas: ContentIdea[];
  errors: string[];
};

export type ProductStrategyResult = {
  generatedAt: string;
  topMovingProducts: ProductSignal[];
  stockButLowMovement: ProductSignal[];
  movementButLowStock: ProductSignal[];
  brandsOrCategoriesToFeature: string[];
  suggestedPushes: string[];
  explanations: string[];
};

export type DailyBiResult = {
  generatedAt: string;
  brief: string;
  actionItems: string[];
  inventoryAlerts: string[];
  recommendations: string[];
  lastSuccessfulScanTime: string | null;
  salesSignal: string;
};

export type ShopperBehaviorResult = {
  generatedAt: string;
  sources: ShopperBehaviorSourceStatusMap;
  summaryCards: {
    topSearches: number;
    noResultSearches: number;
    productPageFriction: number;
    newOpportunities: number;
  };
  searchSignals: {
    topSearches: ShopperSearchTerm[];
    risingSearches: ShopperSearchTerm[];
    noResultSearches: ShopperSearchTerm[];
    noClickSearches: ShopperSearchTerm[];
    missingProductSearches: ShopperSearchTerm[];
    missingCollectionSearches: ShopperSearchTerm[];
    blogTopicSearches: ShopperSearchTerm[];
  };
  frictionSignals: ShopperProductSignal[];
  recommendations: ShopperRecommendation[];
  contentOpportunities: ShopperRecommendation[];
  imports: ShopperBehaviorImportRecord[];
  todaySummary: {
    topShopperSignal: string;
    topFrictionPoint: string;
    topRecommendedAction: string;
    openRecommendationCount: number;
  };
  errors: string[];
};

export type IntelligenceDashboard = {
  summaryCards: {
    inventoryRisks: number;
    salesSignal: string;
    productOpportunities: number;
    contentIdeas: number;
  };
  today: {
    brief: string;
    actionItems: string[];
    inventoryAlerts: string[];
    recommendations: string[];
    lastSuccessfulScanTime: string | null;
    shopperBehavior: ShopperBehaviorResult["todaySummary"];
    actionQueue: {
      topOpenActions: ActionItem[];
      summaryText: string;
    };
    reportData: {
      lastImportAt: string | null;
      mode: "manual_reports" | "real_connectors" | "no_report_data";
      description: string;
    };
  };
  inventory: {
    lowStock: InventoryRiskItem[];
    outOfStock: InventoryRiskItem[];
    highVelocityLowStock: InventoryRiskItem[];
    staleStock: InventoryRiskItem[];
    vendorSummary: VendorInventorySummary[];
  };
  productStrategy: ProductStrategyResult;
  contentRadar: {
    sourceItems: SourceItem[];
    ideas: ContentIdea[];
  };
  shopperBehavior: ShopperBehaviorResult;
  actionQueue: ActionQueueResult;
  sources: ConnectorStatusMap;
  sourceSettings: ContentRadarSourceSettings;
  errors: string[];
};

export type ShopifyVariantProvider = () => Promise<ShopifyVariant[]>;

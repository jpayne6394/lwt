import type { SupplierOpsRepository } from "../storage/repository.ts";
import { assessContentCompliance } from "./complianceGuardAgent.ts";
import type {
  ConnectorStatus,
  ConnectorStatusMap,
  ContentIdea,
  ContentRadarSourceSettings,
  ContentRadarResult,
  SourceConfig,
  SourceItem,
} from "./intelligenceTypes.ts";

export type RunContentRadarAgentInput = {
  repository: SupplierOpsRepository;
  topics: string[];
  sourceConfig: SourceConfig;
  radarSettings?: ContentRadarSourceSettings;
  fetchImpl?: typeof fetch;
};

export async function runContentRadarAgent(input: RunContentRadarAgentInput): Promise<ContentRadarResult> {
  const now = new Date().toISOString();
  const fetcher = input.fetchImpl ?? fetch;
  const settings = normalizeRadarSettings(input.radarSettings, input.topics);
  const topics = normalizeTopics(settings.topicClusters.length ? settings.topicClusters : input.topics);
  const connectorStatuses = buildConnectorStatuses(input.sourceConfig);
  const errors: string[] = [];
  const sourceItems = buildManualSourceItems(topics, now);

  if (connectorStatuses.x.status === "connected") {
    try {
      sourceItems.push(...(await fetchXSignals(input.sourceConfig, settings.xQueries.length ? settings.xQueries : topics, fetcher)));
    } catch (error) {
      connectorStatuses.x.status = "error";
      connectorStatuses.x.error = error instanceof Error ? error.message : "X API request failed";
      errors.push(`X: ${connectorStatuses.x.error}`);
    }
  }

  if (connectorStatuses.reddit.status === "connected") {
    try {
      sourceItems.push(...(await fetchRedditSignals(input.sourceConfig, topics, settings.subreddits, fetcher)));
    } catch (error) {
      connectorStatuses.reddit.status = "error";
      connectorStatuses.reddit.error = error instanceof Error ? error.message : "Reddit API request failed";
      errors.push(`Reddit: ${connectorStatuses.reddit.error}`);
    }
  }

  const filteredSourceItems = filterExcludedTerms(sourceItems, settings.excludedTerms);
  const ideas = topics.map((topic) => buildContentIdea(topic, filteredSourceItems.filter((item) => item.title.toLowerCase().includes(topic.toLowerCase()))));
  await input.repository.saveSourceItems(filteredSourceItems);
  await input.repository.saveContentIdeas(ideas);

  return {
    generatedAt: now,
    connectorStatuses,
    sourceItems: filteredSourceItems,
    ideas,
    errors,
  };
}

export function buildConnectorStatuses(sourceConfig: SourceConfig): ConnectorStatusMap {
  return {
    shopify: connectorStatus("Shopify", missingShopifyEnv(sourceConfig)),
    x: connectorStatus("X", sourceConfig.xBearerToken ? [] : ["X_BEARER_TOKEN"]),
    reddit: connectorStatus(
      "Reddit",
      [
        sourceConfig.redditClientId ? "" : "REDDIT_CLIENT_ID",
        sourceConfig.redditClientSecret ? "" : "REDDIT_CLIENT_SECRET",
        sourceConfig.redditUserAgent ? "" : "REDDIT_USER_AGENT",
      ].filter(Boolean),
    ),
    search: connectorStatus("Search/Trends", sourceConfig.searchProviderKey || sourceConfig.googleTrendsProviderKey ? [] : ["SEARCH_PROVIDER_KEY"]),
  };
}

function connectorStatus(label: string, missingEnvVars: string[]): ConnectorStatus {
  if (missingEnvVars.length) {
    return {
      label,
      status: "not_configured",
      missingEnvVars,
      message: "Not configured - using manual fallback only.",
    };
  }

  return {
    label,
    status: "connected",
    missingEnvVars: [],
    message: "Configured - official connector ready.",
  };
}

function normalizeRadarSettings(settings: ContentRadarSourceSettings | undefined, topics: string[]): ContentRadarSourceSettings {
  return {
    topicClusters: normalizeTopics(settings?.topicClusters?.length ? settings.topicClusters : topics),
    keywords: normalizeTopics(settings?.keywords ?? []),
    excludedTerms: normalizeTopics(settings?.excludedTerms ?? []),
    subreddits: normalizeTopics(settings?.subreddits?.length ? settings.subreddits : ["Supplements"]),
    xQueries: normalizeTopics(settings?.xQueries ?? []),
    searchQueries: normalizeTopics(settings?.searchQueries ?? []),
    scanFrequencyNotes: settings?.scanFrequencyNotes?.trim() || "Manual fallback runs on demand.",
  };
}

function missingShopifyEnv(sourceConfig: SourceConfig): string[] {
  return [
    sourceConfig.shopifyStoreDomain ? "" : "SHOPIFY_STORE_DOMAIN",
    sourceConfig.shopifyAdminAccessToken ? "" : "SHOPIFY_ADMIN_ACCESS_TOKEN",
  ].filter(Boolean);
}

function normalizeTopics(topics: string[]): string[] {
  const normalized = topics.map((topic) => topic.trim()).filter(Boolean);
  return [...new Set(normalized)].slice(0, 30);
}

function buildManualSourceItems(topics: string[], collectedAt: string): SourceItem[] {
  return topics.map((topic) => ({
    id: `source_manual_${slug(topic)}_${Date.now()}`,
    source: "manual",
    title: topic,
    textExcerpt: `Manual LWT topic seed for ${topic}. Use this when social/search connectors are not configured.`,
    collectedAt,
    scoreJson: { source: "manual_topic_seed", score: 1 },
  }));
}

function filterExcludedTerms(items: SourceItem[], excludedTerms: string[]): SourceItem[] {
  if (!excludedTerms.length) {
    return items;
  }
  return items.filter((item) => {
    const searchable = `${item.title} ${item.textExcerpt}`.toLowerCase();
    return !excludedTerms.some((term) => searchable.includes(term.toLowerCase()));
  });
}

function buildContentIdea(topic: string, evidence: SourceItem[]): ContentIdea {
  const assessment = assessContentCompliance(topic);
  const readableTopic = titleCase(topic);
  const sourceSummary = evidence.length
    ? evidence.map((item) => `${item.source}: ${item.title}`).slice(0, 3).join("; ")
    : `Manual topic seed: ${topic}`;

  return {
    id: `idea_${slug(topic)}_${Date.now()}`,
    topic,
    sourceSummary,
    suggestedTitle: titleForTopic(readableTopic),
    productTieIn: tieInForTopic(topic),
    complianceRisk: assessment.risk,
    complianceReason: assessment.reason,
    saferAngle: assessment.saferAngle,
    suggestedCta: assessment.suggestedCta,
    status: "idea",
    createdAt: new Date().toISOString(),
  };
}

function titleForTopic(topic: string): string {
  if (/magnesium/i.test(topic)) {
    return "How to Think About Different Forms of Magnesium";
  }
  if (/sleep/i.test(topic)) {
    return "A Practical Guide to Sleep Support Without the Morning Fog";
  }
  return `${topic}: What to Know Before Choosing Wellness Support`;
}

function tieInForTopic(topic: string): string {
  const normalized = topic.toLowerCase();
  if (normalized.includes("magnesium")) return "Magnesium and mineral support products";
  if (normalized.includes("sleep")) return "Sleep support products and practitioner consults";
  if (normalized.includes("gut") || normalized.includes("probiotic")) return "Digestive wellness and probiotic categories";
  if (normalized.includes("immune") || normalized.includes("vitamin d")) return "Immune support and vitamin D categories";
  if (normalized.includes("stress")) return "Stress support and adaptogen categories";
  return "Related LWT wellness categories and practitioner-guided selection";
}

async function fetchXSignals(sourceConfig: SourceConfig, topics: string[], fetcher: typeof fetch): Promise<SourceItem[]> {
  const query = topics.slice(0, 5).map((topic) => `"${topic}"`).join(" OR ");
  const url = new URL("https://api.twitter.com/2/tweets/search/recent");
  url.searchParams.set("query", query);
  url.searchParams.set("max_results", "10");
  url.searchParams.set("tweet.fields", "created_at,public_metrics");
  const response = await fetcher(url, {
    headers: { Authorization: `Bearer ${sourceConfig.xBearerToken}` },
  });
  if (!response.ok) {
    throw new Error(`Official X API returned ${response.status}`);
  }
  const json = (await response.json()) as { data?: Array<{ id: string; text: string; created_at?: string; public_metrics?: Record<string, unknown> }> };
  return (json.data ?? []).map((tweet) => ({
    id: `source_x_${tweet.id}`,
    source: "x",
    sourceUrl: `https://x.com/i/web/status/${tweet.id}`,
    title: excerpt(tweet.text, 80),
    textExcerpt: excerpt(tweet.text, 280),
    collectedAt: tweet.created_at ?? new Date().toISOString(),
    scoreJson: tweet.public_metrics ?? {},
  }));
}

async function fetchRedditSignals(
  sourceConfig: SourceConfig,
  topics: string[],
  subreddits: string[],
  fetcher: typeof fetch,
): Promise<SourceItem[]> {
  const tokenResponse = await fetcher("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sourceConfig.redditClientId}:${sourceConfig.redditClientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": sourceConfig.redditUserAgent ?? "lwt-intelligence-center/1.0",
    },
    body: "grant_type=client_credentials",
  });
  if (!tokenResponse.ok) {
    throw new Error(`Official Reddit API auth returned ${tokenResponse.status}`);
  }
  const tokenJson = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenJson.access_token) {
    throw new Error("Official Reddit API did not return an access token");
  }

  const query = topics.slice(0, 5).join(" OR ");
  const collected: SourceItem[] = [];

  for (const subreddit of subreddits.slice(0, 5)) {
    const url = new URL(`https://oauth.reddit.com/r/${subreddit}/search`);
    url.searchParams.set("q", query);
    url.searchParams.set("restrict_sr", "1");
    url.searchParams.set("sort", "hot");
    url.searchParams.set("limit", "10");
    const response = await fetcher(url, {
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
        "User-Agent": sourceConfig.redditUserAgent ?? "lwt-intelligence-center/1.0",
      },
    });
    if (!response.ok) {
      throw new Error(`Official Reddit API search returned ${response.status}`);
    }
    const json = (await response.json()) as {
      data?: { children?: Array<{ data?: { id: string; title: string; selftext?: string; permalink?: string; score?: number; num_comments?: number } }> };
    };
    collected.push(
      ...(json.data?.children ?? []).flatMap((child) => {
        const post = child.data;
        if (!post) return [];
        return [
          {
            id: `source_reddit_${post.id}`,
            source: "reddit" as const,
            sourceUrl: post.permalink ? `https://www.reddit.com${post.permalink}` : undefined,
            sourceAuthorOrSubreddit: subreddit,
            title: post.title,
            textExcerpt: excerpt(post.selftext || post.title, 280),
            collectedAt: new Date().toISOString(),
            scoreJson: { score: post.score ?? 0, comments: post.num_comments ?? 0 },
          },
        ];
      }),
    );
  }

  return collected;
}

function excerpt(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function titleCase(value: string): string {
  return value.replace(/\w\S*/g, (part) => part[0].toUpperCase() + part.slice(1).toLowerCase());
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

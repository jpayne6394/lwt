export type ShopifyAdminGraphqlClientOptions = {
  shop: string;
  accessToken: string;
  apiVersion: string;
};

export class ShopifyAdminGraphqlClient {
  readonly #shop: string;
  readonly #accessToken: string;
  readonly #apiVersion: string;

  constructor(options: ShopifyAdminGraphqlClientOptions) {
    this.#shop = options.shop;
    this.#accessToken = options.accessToken;
    this.#apiVersion = options.apiVersion;
  }

  async graphql(query: string, variables: Record<string, unknown>): Promise<unknown> {
    const response = await fetch(`https://${this.#shop}/admin/api/${this.#apiVersion}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": this.#accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });

    const json = await response.json();
    if (!response.ok || json.errors) {
      throw new Error(`Shopify GraphQL failed: ${JSON.stringify(json.errors ?? json)}`);
    }

    return json;
  }
}


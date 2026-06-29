import type { ShopifyVariant } from "../domain/types.ts";
import type { GraphqlExecutor } from "./shopify-sync-client.ts";

export class ShopifyCatalogClient {
  readonly #graphql: GraphqlExecutor;

  constructor(graphql: GraphqlExecutor) {
    this.#graphql = graphql;
  }

  async listVariants(): Promise<ShopifyVariant[]> {
    const variants: ShopifyVariant[] = [];
    let after: string | null = null;

    do {
      const response = (await this.#graphql(PRODUCT_VARIANTS_QUERY, { after })) as ShopifyCatalogResponse;
      const products = response.data.products;
      for (const product of products.nodes) {
        for (const variant of product.variants.nodes) {
          const level = variant.inventoryItem.inventoryLevels.nodes[0];
          variants.push({
            productId: product.id,
            variantId: variant.id,
            inventoryItemId: variant.inventoryItem.id,
            locationId: level?.location.id ?? "",
            handle: product.handle,
            title: product.title,
            vendor: product.vendor,
            category: product.productType || undefined,
            sku: variant.sku ?? "",
            barcode: variant.barcode ?? "",
            price: Number(variant.price),
            compareAtPrice: variant.compareAtPrice == null ? null : Number(variant.compareAtPrice),
            cost: variant.inventoryItem.unitCost?.amount == null ? null : Number(variant.inventoryItem.unitCost.amount),
            status: product.status.toLowerCase(),
            inventoryQuantity: level?.quantities.find((quantity) => quantity.name === "available")?.quantity,
          });
        }
      }
      after = products.pageInfo.hasNextPage ? products.pageInfo.endCursor : null;
    } while (after);

    return variants;
  }
}

type ShopifyCatalogResponse = {
  data: {
    products: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: Array<{
        id: string;
        handle: string;
        title: string;
        vendor: string;
        productType: string;
        status: string;
        variants: {
          nodes: Array<{
            id: string;
            sku: string | null;
            barcode: string | null;
            price: string;
            compareAtPrice: string | null;
            inventoryItem: {
              id: string;
              unitCost: { amount: string } | null;
              inventoryLevels: {
                nodes: Array<{
                location: { id: string };
                quantities: Array<{ name: string; quantity: number }>;
              }>;
            };
            };
          }>;
        };
      }>;
    };
  };
};

const PRODUCT_VARIANTS_QUERY = `#graphql
query SupplierOpsProducts($after: String) {
  products(first: 100, after: $after) {
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      id
      handle
      title
      vendor
      productType
      status
      variants(first: 100) {
        nodes {
          id
          sku
          barcode
          price
          compareAtPrice
          inventoryItem {
            id
            unitCost {
              amount
            }
            inventoryLevels(first: 1) {
              nodes {
                location {
                  id
                }
                quantities(names: ["available"]) {
                  name
                  quantity
                }
              }
            }
          }
        }
      }
    }
  }
}`;

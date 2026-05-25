import type { PlannedChange } from "../domain/types.ts";

export type GraphqlExecutor = (query: string, variables: Record<string, unknown>) => Promise<unknown>;

export type ShopifySyncClientOptions = {
  graphql: GraphqlExecutor;
};

export class ShopifySyncClient {
  readonly #graphql: GraphqlExecutor;

  constructor(options: ShopifySyncClientOptions) {
    this.#graphql = options.graphql;
  }

  async applyChanges(changes: PlannedChange[]): Promise<void> {
    for (const change of changes) {
      await this.applyChange(change);
    }
  }

  async applyChange(change: PlannedChange): Promise<void> {
    if (change.type === "inventory") {
      await this.#graphql(INVENTORY_SET_QUANTITIES_MUTATION, {
        input: {
          name: "available",
          reason: "correction",
          ignoreCompareQuantity: true,
          quantities: [
            {
              inventoryItemId: change.inventoryItemId,
              locationId: change.locationId,
              quantity: change.quantity,
            },
          ],
        },
      });
      return;
    }

    if (change.type === "price") {
      await this.#graphql(PRODUCT_VARIANTS_BULK_UPDATE_MUTATION, {
        productId: change.productId,
        variants: [
          {
            id: change.variantId,
            price: change.price.toFixed(2),
            compareAtPrice: change.compareAtPrice == null ? null : change.compareAtPrice.toFixed(2),
          },
        ],
      });
      return;
    }

    if (change.type === "cost") {
      await this.#graphql(INVENTORY_ITEM_UPDATE_MUTATION, {
        id: change.inventoryItemId,
        input: {
          cost: change.cost.toFixed(2),
        },
      });
      return;
    }

    const created = (await this.#graphql(PRODUCT_CREATE_MUTATION, {
      product: {
        title: change.supplierProduct.title,
        vendor: change.supplierProduct.brand ?? change.supplierProduct.supplierName,
        status: "DRAFT",
        tags: ["supplier-agent-draft", change.supplierProduct.supplierName],
        seo: {
          title: change.supplierProduct.title,
          description: `${change.supplierProduct.title} from ${change.supplierProduct.supplierName}`,
        },
      },
      media: (change.supplierProduct.imageUrls ?? []).map((url) => ({
        originalSource: url,
        mediaContentType: "IMAGE",
        alt: change.supplierProduct.title,
      })),
    })) as ProductCreateResponse;

    const product = created.data?.productCreate?.product;
    const variant = product?.variants.nodes[0];
    if (!product?.id || !variant?.id) {
      throw new Error("Shopify did not return a draft product variant to update");
    }

    await this.#graphql(PRODUCT_VARIANTS_BULK_UPDATE_MUTATION, {
      productId: product.id,
      variants: [
        {
          id: variant.id,
          price: change.draftPrice == null ? "0.00" : change.draftPrice.toFixed(2),
          barcode: change.supplierProduct.upc ?? null,
          inventoryItem: {
            sku: change.supplierProduct.sku ?? null,
            tracked: true,
          },
        },
      ],
    });

    if (change.supplierProduct.cost !== undefined && variant.inventoryItem?.id) {
      await this.#graphql(INVENTORY_ITEM_UPDATE_MUTATION, {
        id: variant.inventoryItem.id,
        input: {
          cost: change.supplierProduct.cost.toFixed(2),
        },
      });
    }
  }
}

type ProductCreateResponse = {
  data?: {
    productCreate?: {
      product?: {
        id: string;
        variants: {
          nodes: Array<{
            id: string;
            inventoryItem?: {
              id: string;
            };
          }>;
        };
      };
    };
  };
};

const INVENTORY_SET_QUANTITIES_MUTATION = `#graphql
mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
  inventorySetQuantities(input: $input) {
    inventoryAdjustmentGroup {
      createdAt
    }
    userErrors {
      field
      message
    }
  }
}`;

const PRODUCT_VARIANTS_BULK_UPDATE_MUTATION = `#graphql
mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    product {
      id
    }
    productVariants {
      id
      price
      compareAtPrice
    }
    userErrors {
      field
      message
    }
  }
}`;

const INVENTORY_ITEM_UPDATE_MUTATION = `#graphql
mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
  inventoryItemUpdate(id: $id, input: $input) {
    inventoryItem {
      id
      unitCost {
        amount
      }
    }
    userErrors {
      field
      message
    }
  }
}`;

const PRODUCT_CREATE_MUTATION = `#graphql
mutation productCreate($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
  productCreate(product: $product, media: $media) {
    product {
      id
      title
      status
      variants(first: 1) {
        nodes {
          id
          inventoryItem {
            id
          }
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}`;

import type { ShopifyOrderSignal } from "../market-radar/types.ts";
import type { GraphqlExecutor } from "./shopify-sync-client.ts";

export class ShopifyBiClient {
  readonly #graphql: GraphqlExecutor;

  constructor(options: { graphql: GraphqlExecutor }) {
    this.#graphql = options.graphql;
  }

  async listRecentOrders(): Promise<ShopifyOrderSignal[]> {
    const response = (await this.#graphql(RECENT_ORDERS_QUERY, {})) as OrdersResponse;
    return response.data.orders.nodes.map((order) => ({
      id: order.id,
      createdAt: order.createdAt,
      totalPrice: Number(order.totalPriceSet.shopMoney.amount),
      lineItems: order.lineItems.nodes.map((lineItem) => ({
        title: lineItem.title,
        sku: lineItem.sku ?? undefined,
        quantity: lineItem.quantity,
        variantId: lineItem.variant?.id,
        productId: lineItem.product?.id,
      })),
    }));
  }
}

type OrdersResponse = {
  data: {
    orders: {
      nodes: Array<{
        id: string;
        createdAt: string;
        totalPriceSet: {
          shopMoney: {
            amount: string;
          };
        };
        lineItems: {
          nodes: Array<{
            title: string;
            sku: string | null;
            quantity: number;
            variant: { id: string } | null;
            product: { id: string } | null;
          }>;
        };
      }>;
    };
  };
};

const RECENT_ORDERS_QUERY = `#graphql
query SupplierOpsRecentOrders {
  orders(first: 100, sortKey: CREATED_AT, reverse: true) {
    nodes {
      id
      createdAt
      totalPriceSet {
        shopMoney {
          amount
        }
      }
      lineItems(first: 25) {
        nodes {
          title
          sku
          quantity
          variant {
            id
          }
          product {
            id
          }
        }
      }
    }
  }
}`;

import type { GraphqlExecutor } from "./shopify-sync-client.ts";

export type ShopifyBlog = {
  id: string;
  title: string;
  handle: string;
};

export type CreateDraftArticleInput = {
  blogId: string;
  title: string;
  authorName: string;
  bodyHtml: string;
  summary: string;
  tags: string[];
  handle: string;
};

export type ShopifyDraftArticle = {
  id: string;
  title: string;
  handle: string;
};

export class ShopifyContentClient {
  readonly #graphql: GraphqlExecutor;

  constructor(options: { graphql: GraphqlExecutor }) {
    this.#graphql = options.graphql;
  }

  async listBlogs(): Promise<ShopifyBlog[]> {
    const response = (await this.#graphql(BLOGS_QUERY, {})) as BlogsResponse;
    return response.data.blogs.nodes.map((blog) => ({
      id: blog.id,
      title: blog.title,
      handle: blog.handle,
    }));
  }

  async createDraftArticle(input: CreateDraftArticleInput): Promise<ShopifyDraftArticle> {
    const response = (await this.#graphql(ARTICLE_CREATE_MUTATION, {
      article: {
        blogId: input.blogId,
        title: input.title,
        author: {
          name: input.authorName,
        },
        handle: input.handle,
        body: input.bodyHtml,
        summary: input.summary,
        isPublished: false,
        tags: input.tags,
      },
    })) as ArticleCreateResponse;

    const errors = response.data.articleCreate.userErrors ?? [];
    if (errors.length) {
      throw new Error(`Shopify articleCreate failed: ${errors.map((error) => error.message).join("; ")}`);
    }

    const article = response.data.articleCreate.article;
    if (!article?.id) {
      throw new Error("Shopify did not return a draft article");
    }
    return article;
  }
}

type BlogsResponse = {
  data: {
    blogs: {
      nodes: Array<{
        id: string;
        title: string;
        handle: string;
      }>;
    };
  };
};

type ArticleCreateResponse = {
  data: {
    articleCreate: {
      article: ShopifyDraftArticle | null;
      userErrors: Array<{ field?: string[]; message: string; code?: string }>;
    };
  };
};

const BLOGS_QUERY = `#graphql
query SupplierOpsBlogList {
  blogs(first: 50) {
    nodes {
      id
      title
      handle
    }
  }
}`;

const ARTICLE_CREATE_MUTATION = `#graphql
mutation SupplierOpsArticleCreate($article: ArticleCreateInput!) {
  articleCreate(article: $article) {
    article {
      id
      title
      handle
    }
    userErrors {
      field
      message
      code
    }
  }
}`;

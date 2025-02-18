import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  Grid,
  Link,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

interface ProductNode {
  id: string;
  title: string;
  handle: string;
  images: {
    edges: Array<{
      node: {
        url: string;
      };
    }>;
  };
  variants: {
    edges: Array<{
      node: {
        price: string;
      };
    }>;
  };
}

interface ProductEdge {
  node: ProductNode;
}

interface LoaderData {
  products: {
    edges: ProductEdge[];
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const { admin } = await authenticate.admin(request);

  // Fetch all products using pagination
  let allProducts: ProductEdge[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    const query = `
      query GetProducts($cursor: String) {
        products(first: 250, after: $cursor) {
          edges {
            node {
              id
              title
              handle
              images(first: 1) {
                edges {
                  node {
                    url
                  }
                }
              }
              variants(first: 1) {
                edges {
                  node {
                    price
                  }
                }
              }
            }
            cursor
          }
          pageInfo {
            hasNextPage
          }
        }
      }
    `;

    const response = await admin.graphql(query, {
      variables: {
        cursor: cursor,
      },
    });

    const responseJson = await response.json();
    const products = responseJson.data.products;

    // Add the current page of products to our collection
    allProducts = [...allProducts, ...products.edges];

    // Check if there are more products to fetch
    hasNextPage = products.pageInfo.hasNextPage;

    // Update the cursor for the next request if there are more products
    if (hasNextPage && products.edges.length > 0) {
      cursor = products.edges[products.edges.length - 1].cursor;
    }
  }

  // Format the product data to match the original structure
  const formattedProducts = {
    edges: allProducts,
  };

  console.log(`Fetched ${allProducts.length} products total`);
  return { products: formattedProducts };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  // Simple action in case you want to keep the product generation feature
  const { admin } = await authenticate.admin(request);
  const color = ["Red", "Orange", "Yellow", "Green"][Math.floor(Math.random() * 4)];
  const response = await admin.graphql(
    `#graphql
      mutation populateProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            title
            handle
            variants(first: 1) {
              edges {
                node {
                  id
                  price
                }
              }
            }
          }
        }
      }`,
    {
      variables: {
        product: {
          title: `${color} Snowboard`,
        },
      },
    }
  );

  const responseJson = await response.json();
  return { product: responseJson.data.productCreate.product };
};

const Index = () => {
  const { products } = useLoaderData<LoaderData>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const generateProduct = () => fetcher.submit({}, { method: "POST" });

  return (
    <Page>
      <TitleBar title="Products">
        <Button variant="primary" onClick={generateProduct}>
          Generate a product
        </Button>
      </TitleBar>

      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingLg">
                Your Products
              </Text>

              {products && products.edges && products.edges.length > 0 ? (
                <Grid>
                  {products.edges.map((edge) => (
                    <Grid.Cell
                      key={edge.node.id}
                      columnSpan={{ xs: 6, sm: 4, md: 3, lg: 3, xl: 2 }}
                    >
                      <Card padding="400">
                        <BlockStack gap="300" align="center">
                          {edge.node.images.edges[0] ? (
                            <div
                              style={{
                                height: "180px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <img
                                src={edge.node.images.edges[0].node.url}
                                alt={edge.node.title}
                                style={{
                                  maxWidth: "100%",
                                  maxHeight: "170px",
                                  objectFit: "contain",
                                }}
                              />
                            </div>
                          ) : (
                            <div
                              style={{
                                height: "180px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <img
                                src="https://ibb.co/qKT4TR1" // Default image URL
                                alt=" no product preview available"
                                style={{
                                  maxWidth: "100%",
                                  maxHeight: "170px",
                                  objectFit: "contain",
                                }}
                              />
                            </div>
                          )}
                          <Text
                            as="h3"
                            variant="headingMd"
                            alignment="center"
                            fontWeight="bold"
                          >
                            {edge.node.title}
                          </Text>
                          <Text as="p" variant="bodyLg" alignment="center">
                            ${edge.node.variants.edges[0]?.node.price}
                          </Text>
                        </BlockStack>
                      </Card>
                    </Grid.Cell>
                  ))}
                </Grid>
              ) : (
                <Text as="p" variant="bodyMd">
                  No products found. Try generating one!
                </Text>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
};

export default Index;

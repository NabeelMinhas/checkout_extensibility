import { useState, useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData, Form } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  Grid,
  Checkbox,
  Banner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

interface ProductNode {
  id: string;
  title: string;
  handle: string;
  images: { edges: Array<{ node: { url: string } }> };
  variants: { edges: Array<{ node: { price: string } }> };
}

interface ProductEdge {
  node: ProductNode;
}

interface LoaderData {
  products: { edges: ProductEdge[] };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const { admin } = await authenticate.admin(request);

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
              images(first: 1) { edges { node { url } } }
              variants(first: 1) { edges { node { price } } }
            }
            cursor
          }
          pageInfo { hasNextPage }
        }
      }
    `;

    const response = await admin.graphql(query, { variables: { cursor } });
    const responseJson = await response.json();
    const products = responseJson.data.products;

    allProducts = [...allProducts, ...products.edges];
    hasNextPage = products.pageInfo.hasNextPage;
    if (hasNextPage && products.edges.length > 0) {
      cursor = products.edges[products.edges.length - 1].cursor;
    }
  }

  return { products: { edges: allProducts } };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const { session } = await authenticate.admin(request);
  const selectedProductIds = formData.getAll("selectedProducts") as string[];

  const shopDomain = session.shop;
  const shop = await prisma.shop.findUnique({
    where: {
      shopifyDomain: shopDomain,
    },
  });

  if (!shop) {
    return { error: `Shop with domain ${shopDomain} not found` };
  }

  if (selectedProductIds.length === 0) {
    return { error: "No products selected." };
  }

  try {
    await prisma.upsellItem.createMany({
      data: selectedProductIds.map((id) => ({
        shopifyProductId: id,
        shopId: shop.id
      })),
    });
    return { success: "Products saved successfully!" };
  } catch (error) {
    return { error: "An error occurred while saving products." };
  }
};

export default function Index() {
  const { products } = useLoaderData<LoaderData>();
  const fetcher = useFetcher();
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState<boolean>(false);

  const toggleProductSelection = (id: string) => {
    setSelectedProducts((prev) =>
      prev.includes(id) 
        ? prev.filter((pid) => pid !== id) 
        : [...prev, id]
    );
  };

  useEffect(() => {
    if (fetcher.data?.error) {
      setMessage(fetcher.data.error);
      setIsError(true);
    } else if (fetcher.data?.success) {
      setMessage(fetcher.data.success);
      setIsError(false);
    }
  }, [fetcher.data]);

  return (
    <Page>
      <TitleBar title="Products" />
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingLg">Your Products</Text>

              {products.edges.length > 0 ? (
                <Grid>
                  {products.edges.map(({ node }) => (
                    <Grid.Cell 
                      key={node.id} 
                      columnSpan={{ xs: 6, sm: 4, md: 3, lg: 3, xl: 2 }}
                    >
                      <Card padding="400">
                        <BlockStack gap="300" align="center">
                          <Checkbox
                            label=""
                            checked={selectedProducts.includes(node.id)}
                            onChange={() => toggleProductSelection(node.id)}
                          />
                          <img
                            src={node.images.edges[0]?.node.url || "https://ibb.co/qKT4TR1"}
                            alt={node.title}
                            style={{
                              maxWidth: "100%",
                              maxHeight: "170px",
                              objectFit: "contain"
                            }}
                          />
                          <Text 
                            as="h3" 
                            variant="headingMd" 
                            alignment="center" 
                            fontWeight="bold"
                          >
                            {node.title}
                          </Text>
                          <Text as="p" variant="bodyLg" alignment="center">
                            ${node.variants.edges[0]?.node.price}
                          </Text>
                        </BlockStack>
                      </Card>
                    </Grid.Cell>
                  ))}
                </Grid>
              ) : (
                <Text as="p" variant="bodyMd">No products found.</Text>
              )}

              {selectedProducts.length > 0 && (
                <fetcher.Form method="post">
                  {selectedProducts.map((id) => (
                    <input 
                      key={id} 
                      type="hidden" 
                      name="selectedProducts" 
                      value={id} 
                    />
                  ))}
                  <Button submit variant="primary">
                    Save Selected Products
                  </Button>
                </fetcher.Form>
              )}

              {message && (
                <Banner status={isError ? "critical" : "success"}>
                  <p>{message}</p>
                </Banner>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
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
  InlineStack,
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
  existingProducts: string[];
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // Fetch existing products from database
  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: session.shop },
    include: { upsellItems: true },
  });

  const existingProducts = shop?.upsellItems.map(item => item.shopifyProductId) || [];

  let allProducts: ProductEdge[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    const query = `
      query GetProducts($cursor: String) {
        products(first: 250, after: $cursor, query: "status:ACTIVE") {
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

  return { 
    products: { edges: allProducts },
    existingProducts
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const { session } = await authenticate.admin(request);
  const intent = formData.get("intent") as string;
  const productIds = formData.getAll("selectedProducts") as string[];

  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: session.shop },
  });

  if (!shop) {
    return { error: `Shop with domain ${session.shop} not found` };
  }

  try {
    if (intent === "delete") {
      await prisma.upsellItem.deleteMany({
        where: {
          shopId: shop.id,
          shopifyProductId: { in: productIds }
        },
      });
      return { success: "Products removed successfully!" };
    } else {
      if (productIds.length === 0) {
        return { error: "No products selected." };
      }

      await prisma.upsellItem.createMany({
        data: productIds.map((id) => ({
          shopifyProductId: id,
          shopId: shop.id
        }))
      });
      return { success: "Products saved successfully!" };
    }
  } catch (error) {
    return { error: "An error occurred while processing products." };
  }
};

export default function Index() {
  const { products, existingProducts } = useLoaderData<LoaderData>();
  const fetcher = useFetcher();
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [showExisting, setShowExisting] = useState(false);
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
      // Clear selections after successful action
      setSelectedProducts([]);
    }
  }, [fetcher.data]);

  const filteredProducts = products.edges.filter(({ node }) => 
    showExisting 
      ? existingProducts.includes(node.id)
      : !existingProducts.includes(node.id)
  );

  return (
    <Page>
      <TitleBar title="Products" />
      <Layout>
        <Layout.Section>
          {message && (
            <Banner status={isError ? "critical" : "success"} onDismiss={() => setMessage(null)}>
              <p>{message}</p>
            </Banner>
          )}

          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingLg">
                  {showExisting ? "Selected Upsell Products" : "Available Products"}
                </Text>
                <InlineStack gap="300">
    
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
                      <input 
                        type="hidden" 
                        name="intent" 
                        value={showExisting ? "delete" : "save"} 
                      />
                      <Button submit variant="primary">
                        {showExisting ? "Delete Upsell Items" : "Create Upsell Items"}
                      </Button>
                    </fetcher.Form>
                  )}
                  <Button onClick={() => setShowExisting(!showExisting)}>
                    {showExisting ? "Show Products" : "Show Upsell Items"}
                  </Button>
                </InlineStack>
              </InlineStack>

              {filteredProducts.length > 0 ? (
                <Grid>
                  {filteredProducts.map(({ node }) => (
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
                <Text as="p" variant="bodyMd">
                  {showExisting 
                    ? "No products have been selected as upsell items." 
                    : "No available products found."}
                </Text>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
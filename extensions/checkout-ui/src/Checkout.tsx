import { useEffect, useState } from "react";
import {
  reactExtension,
  Divider,
  Image,
  Banner,
  Heading,
  Button,
  InlineLayout,
  BlockStack,
  Text,
  SkeletonText,
  SkeletonImage,
  useCartLines,
  useApplyCartLinesChange,
  useApi,
} from "@shopify/ui-extensions-react/checkout";

interface ProductVariant {
  id: string;
  price: { amount: string };
}

interface Product {
  id: string;
  title: string;
  images: { nodes: { url: string }[] };
  variants: { nodes: ProductVariant[] };
}

export default reactExtension("purchase.checkout.block.render", () => <App />);

function App() {
  const { query, i18n, shop, extension } = useApi();
  const applyCartLinesChange = useApplyCartLinesChange();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [actionStates, setActionStates] = useState<{[key: string]: boolean}>({});
  const [showError, setShowError] = useState<boolean>(false);
  const lines = useCartLines();

  useEffect(() => {
    fetchUpsellProducts();
  }, []);

  useEffect(() => {
    if (showError) {
      const timer = setTimeout(() => setShowError(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showError]);

  async function handleAddToCart(variantId: string) {
    setActionStates(prev => ({ ...prev, [variantId]: true }));
    const result = await applyCartLinesChange({
      type: "addCartLine",
      merchandiseId: variantId,
      quantity: 1,
    });
    setActionStates(prev => ({ ...prev, [variantId]: false }));
    if (result.type === "error") {
      setShowError(true);
    }
  }

  async function fetchUpsellProducts() {
    setLoading(true);
    try {
      const baseUrl = new URL(extension.scriptUrl).origin;
      const shopifyDomain = shop.myshopifyDomain;
      
      const response = await fetch(`${baseUrl}/api/upsell?shopDomain=${shopifyDomain}`, {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch upsell items");
      }

      const upsellItems = await response.json();

      if (!Array.isArray(upsellItems) || upsellItems.length === 0) {
        setProducts([]);
        return;
      }

      const productIds = upsellItems.map((item) => {
        const shopifyId = item.shopifyProductId;
        return shopifyId.startsWith("gid://shopify/Product/")
          ? shopifyId
          : `gid://shopify/Product/${shopifyId}`;
      });

      const { data, errors } = await query<{ nodes: Product[] }>(
        `query ($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              title
              images(first: 1) {
                nodes {
                  url
                }
              }
              variants(first: 1) {
                nodes {
                  id
                  price {
                    amount
                  }
                }
              }
            }
          }
        }`,
        {
          variables: { ids: productIds },
        }
      );

      if (errors) {
        throw new Error(JSON.stringify(errors));
      }

      setProducts(Array.isArray(data.nodes) ? data.nodes.filter(Boolean) : []);
    } catch (error) {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (!loading && products.length === 0) {
    return null;
  }

  // Get products that aren't already in the cart
  const availableProducts = products.filter((product) => 
    !product.variants.nodes.some(({ id }) => 
      lines.some((line: any) => line.merchandise.id === id)
    )
  );

  if (availableProducts.length === 0) {
    return null;
  }

  return (
    <BlockStack spacing="loose">
      <Divider />
      <Heading level={2}>You might also like</Heading>
      
      <BlockStack spacing="loose">
        
          {availableProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              i18n={i18n}
              loading={actionStates[product.variants.nodes[0].id] || false}
              onAction={() => handleAddToCart(product.variants.nodes[0].id)}
            />
          ))}
      </BlockStack>

      {showError && (
        <Banner status="critical">
          There was an issue adding this product. Please try again.
        </Banner>
      )}
    </BlockStack>
  );
}

function LoadingSkeleton() {
  return (
    <BlockStack spacing="loose">
      <Divider />
      <Heading level={2}>You might also like</Heading>
      <BlockStack spacing="loose">
        <InlineLayout spacing="base" columns={[64, "fill", "auto"]} blockAlignment="center">
          <SkeletonImage aspectRatio={1} />
          <BlockStack spacing="none">
            <SkeletonText inlineSize="large" />
            <SkeletonText inlineSize="small" />
          </BlockStack>
          <Button kind="secondary" disabled={true}>
            Add To Cart
          </Button>
        </InlineLayout>
      </BlockStack>
    </BlockStack>
  );
}

interface ProductCardProps {
  product: Product;
  i18n: any;
  loading: boolean;
  onAction: () => void;
}

function ProductCard({ product, i18n, loading, onAction }: ProductCardProps) {
  const { images, title, variants } = product;
  const renderPrice = i18n.formatCurrency(variants.nodes[0].price.amount);
  const imageUrl = images.nodes[0]?.url ?? "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_medium.png?format=webp&v=1530129081";

  return (
    <BlockStack spacing="base">
      <InlineLayout spacing="base" columns={[64, "fill", "auto"]} blockAlignment="center">
        <Image
          border="base"
          borderWidth="base"
          borderRadius="loose"
          source={imageUrl}
          accessibilityDescription={title}
          aspectRatio={1}
        />
        <BlockStack spacing="none">
          <Text size="medium" emphasis="bold">
            {title}
          </Text>
          <Text appearance="subdued">{renderPrice}</Text>
        </BlockStack>
        <Button
          kind="secondary"
          loading={loading}
          accessibilityLabel={`Add ${title} to cart`}
          onPress={onAction}
        >
          Add To Cart
        </Button>
      </InlineLayout>
    </BlockStack>
  );
}
import { LoaderFunctionArgs } from "@remix-run/node";
import prisma from "app/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shopDomain");

  try {
    const shop = await prisma.shop.findUnique({
      where: {
        shopifyDomain: shopDomain || "",
      },
      include: {
        upsellItems: true,
      },
    });

    if (!shop) {
      return new Response(JSON.stringify({ error: "Shop not found" }), {
        status: 404,
        headers: headers,
      });
    }

    return new Response(JSON.stringify(shop.upsellItems), {
      headers: headers,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: headers,
    });
  }
};

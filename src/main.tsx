import { createRoot } from "react-dom/client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import "./index.css";
import App from "./App";
import createApp from "@shopify/app-bridge";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

// Check if running in Shopify embedded context
const urlParams = new URLSearchParams(window.location.search);
const shopifyHost = urlParams.get("host");
const shopifyShop = urlParams.get("shop");

// Initialize Shopify App Bridge if in embedded context
if (shopifyHost && shopifyShop && import.meta.env.VITE_SHOPIFY_API_KEY) {
  const appBridgeConfig = {
    apiKey: import.meta.env.VITE_SHOPIFY_API_KEY,
    host: shopifyHost,
    forceRedirect: false,
  };
  
  try {
    createApp(appBridgeConfig);
  } catch {
    // Failed to initialize Shopify App Bridge
  }
}

createRoot(document.getElementById("root")!).render(
  <ConvexAuthProvider client={convex}>
    <App />
  </ConvexAuthProvider>,
);

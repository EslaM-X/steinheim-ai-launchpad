import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Steinheim — Marketing Intelligence" },

      // One description tag carrying both languages. Two tags sharing a `name`
      // are invalid HTML and the router keeps only one, so the Arabic was
      // silently dropped when they were separate.
      {
        name: "description",
        content:
          "The marketing operating system for Steinheim — a verified product knowledge base driving AI agents that plan, write and quality-check daily content. Every claim traced to a fact, every post approved by a person. نظام التشغيل التسويقي لعلامة Steinheim — قاعدة معرفة موثّقة تقود وكلاء ذكاء اصطناعي يخطّطون ويكتبون ويراجعون محتوى كل يوم. كل معلومة مسنودة بمصدر، وكل منشور يعتمده إنسان.",
      },
      {
        name: "keywords",
        content:
          "Steinheim, marketing intelligence, luxury bathroom systems, German engineering, AI marketing, content governance, Egypt",
      },
      { name: "author", content: "Steinheim" },
      { name: "application-name", content: "Steinheim" },
      { name: "apple-mobile-web-app-title", content: "Steinheim" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "mobile-web-app-capable", content: "yes" },
      // Obsidian in both themes: the chrome around the app is always the brand.
      { name: "theme-color", content: "#080808" },
      { name: "color-scheme", content: "light dark" },
      { name: "format-detection", content: "telephone=no" },
      // The dashboard is private; nothing here belongs in a search index.
      { name: "robots", content: "noindex, nofollow" },

      { property: "og:site_name", content: "Steinheim" },
      { property: "og:title", content: "Steinheim — Marketing Intelligence" },
      {
        property: "og:description",
        content:
          "A marketing operating system that cannot lie about the product. Verified truth, AI agents, human approval.",
      },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "en_GB" },
      { property: "og:locale:alternate", content: "ar_EG" },
      { property: "og:image", content: "/og-image.svg" },
      { property: "og:image:alt", content: "Steinheim — Marketing Intelligence" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },

      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Steinheim — Marketing Intelligence" },
      {
        name: "twitter:description",
        content:
          "A marketing operating system that cannot lie about the product. Verified truth, AI agents, human approval.",
      },
      { name: "twitter:image", content: "/og-image.svg" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "alternate icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "apple-touch-icon", href: "/icon.svg" },
      { rel: "mask-icon", href: "/favicon.svg", color: "#080808" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Inter:wght@400;500;600&family=Noto+Kufi+Arabic:wght@400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    // Language, direction and theme are applied on the client from stored
    // preferences, so the server cannot render the final attributes here.
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
          <Toaster position="top-center" richColors />
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

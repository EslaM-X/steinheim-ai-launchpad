import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Steinheim — Marketing Intelligence" },
      {
        name: "description",
        content:
          "AI-powered marketing workspace for Steinheim Egypt: knowledge base, daily content generation and publishing.",
      },
      { property: "og:title", content: "Steinheim — Marketing Intelligence" },
      {
        property: "og:description",
        content: "AI-powered marketing workspace for Steinheim Egypt.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});

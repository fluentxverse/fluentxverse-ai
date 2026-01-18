import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const NewsArticleSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  content: z.string().nullable(),
  url: z.string(),
  source: z.string(),
  publishedAt: z.string(),
  author: z.string().nullable()
});
const fetchNewsTool = createTool({
  id: "fetch-news",
  description: "Fetches latest news articles from news sources based on a topic or keyword. Use this to gather news content for article creation.",
  inputSchema: z.object({
    topic: z.string().describe("The topic or keyword to search news for"),
    maxArticles: z.number().optional().default(5).describe("Maximum number of articles to fetch (default: 5)")
  }),
  outputSchema: z.object({
    articles: z.array(NewsArticleSchema),
    totalResults: z.number(),
    query: z.string()
  }),
  execute: async ({ context }) => {
    const { topic, maxArticles = 5 } = context;
    const newsApiKey = process.env.NEWSAPI_KEY;
    if (newsApiKey) {
      try {
        const response = await fetch(
          `https://newsapi.org/v2/everything?q=${encodeURIComponent(topic)}&sortBy=publishedAt&pageSize=${maxArticles}&apiKey=${newsApiKey}`
        );
        const data = await response.json();
        if (data.status === "ok") {
          const articles = data.articles.map((article) => ({
            title: article.title || "",
            description: article.description || null,
            content: article.content || null,
            url: article.url || "",
            source: article.source?.name || "Unknown",
            publishedAt: article.publishedAt || (/* @__PURE__ */ new Date()).toISOString(),
            author: article.author || null
          }));
          return {
            articles,
            totalResults: data.totalResults,
            query: topic
          };
        }
      } catch (error) {
        console.error("NewsAPI fetch failed:", error);
      }
    }
    const gnewsKey = process.env.GNEWS_KEY;
    if (gnewsKey) {
      try {
        const response = await fetch(
          `https://gnews.io/api/v4/search?q=${encodeURIComponent(topic)}&max=${maxArticles}&apikey=${gnewsKey}`
        );
        const data = await response.json();
        if (data.articles) {
          const articles = data.articles.map((article) => ({
            title: article.title || "",
            description: article.description || null,
            content: article.content || null,
            url: article.url || "",
            source: article.source?.name || "Unknown",
            publishedAt: article.publishedAt || (/* @__PURE__ */ new Date()).toISOString(),
            author: null
          }));
          return {
            articles,
            totalResults: data.totalArticles || articles.length,
            query: topic
          };
        }
      } catch (error) {
        console.error("GNews fetch failed:", error);
      }
    }
    try {
      const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-US&gl=US&ceid=US:en`;
      const response = await fetch(rssUrl);
      const xmlText = await response.text();
      const articles = [];
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/;
      const linkRegex = /<link>(.*?)<\/link>/;
      const pubDateRegex = /<pubDate>(.*?)<\/pubDate>/;
      const sourceRegex = /<source[^>]*>(.*?)<\/source>/;
      let match;
      let count = 0;
      while ((match = itemRegex.exec(xmlText)) !== null && count < maxArticles) {
        const itemContent = match[1] ?? "";
        const titleMatch = itemContent.match(titleRegex);
        const linkMatch = itemContent.match(linkRegex);
        const pubDateMatch = itemContent.match(pubDateRegex);
        const sourceMatch = itemContent.match(sourceRegex);
        const title = titleMatch?.[1] || titleMatch?.[2] || "";
        const url = linkMatch?.[1] || "";
        const publishedAt = pubDateMatch?.[1] || (/* @__PURE__ */ new Date()).toISOString();
        const source = sourceMatch?.[1] || "Google News";
        if (title && url) {
          articles.push({
            title,
            description: null,
            content: null,
            url,
            source,
            publishedAt,
            author: null
          });
          count++;
        }
      }
      return {
        articles,
        totalResults: articles.length,
        query: topic
      };
    } catch (error) {
      console.error("RSS fetch failed:", error);
    }
    return {
      articles: [],
      totalResults: 0,
      query: topic
    };
  }
});
const fetchArticleContentTool = createTool({
  id: "fetch-article-content",
  description: "Fetches the full content of an article from its URL. Use this when you need more detailed content from a specific article.",
  inputSchema: z.object({
    url: z.string().url().describe("The URL of the article to fetch")
  }),
  outputSchema: z.object({
    title: z.string(),
    content: z.string(),
    url: z.string(),
    success: z.boolean(),
    error: z.string().optional()
  }),
  execute: async ({ context }) => {
    const { url } = context;
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
      });
      const html = await response.text();
      const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
      const title = titleMatch?.[1] || "";
      let content = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "").replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "").replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "").replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "");
      const articleMatch = content.match(
        /<article[^>]*>([\s\S]*?)<\/article>/i
      );
      if (articleMatch && articleMatch[1]) {
        content = articleMatch[1];
      }
      content = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5e3);
      return {
        title,
        content,
        url,
        success: true
      };
    } catch (error) {
      return {
        title: "",
        content: "",
        url,
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch article"
      };
    }
  }
});

export { fetchArticleContentTool, fetchNewsTool };

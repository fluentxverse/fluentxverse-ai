# FluentXverse AI

AI-powered news aggregation and article generation using **Mastra AI** framework with **OpenAI GPT-4o**.

## Features

- 🔍 **News Fetching**: Automatically fetch news from multiple sources (NewsAPI, GNews, Google News RSS)
- ✍️ **Article Generation**: Create original articles from gathered news using AI
- 📋 **News Summaries**: Generate quick news summaries on any topic
- 🎯 **Structured Output**: Get articles with structured data (headlines, tags, sources)
- 🔄 **Streaming**: Real-time article generation with streaming responses

## Setup

### 1. Install dependencies

```bash
bun install
```

### 2. Configure environment variables

Copy the example environment file and add your API keys:

```bash
cp .env.example .env
```

Edit `.env` and add:
- `OPENAI_API_KEY` (required) - Get from [OpenAI](https://platform.openai.com/api-keys)
- `NEWSAPI_KEY` (optional) - Get from [NewsAPI](https://newsapi.org)
- `GNEWS_KEY` (optional) - Get from [GNews](https://gnews.io)

> Note: If no news API keys are provided, the system uses Google News RSS as a fallback.

## Usage

### Run Examples

```bash
# Get a quick news summary
bun run example:summary

# Generate a full article
bun run example:article

# Get structured article output
bun run example:structured

# Stream article generation in real-time
bun run example:stream
```

### Use Mastra Studio (Development UI)

```bash
bun run dev
```

Then open [http://localhost:4111](http://localhost:4111) to interact with your agents.

### Programmatic Usage

```typescript
import { mastra } from "./src/mastra";

// Get the article writer agent
const agent = mastra.getAgent("newsArticleWriterAgent");

// Generate an article
const result = await agent.generate(
  "Write an article about the latest AI developments"
);

console.log(result.text);
```

## Project Structure

```
src/
├── mastra/
│   ├── index.ts                    # Mastra instance with registered agents
│   ├── agents/
│   │   └── article-writer.agent.ts # News article writer agents
│   └── tools/
│       └── news-fetcher.tool.ts    # News fetching tools
├── dispatch.daily.services/
│   └── dispatch.daily.service.ts   # Daily dispatch service
└── examples/
    └── news-article.example.ts     # Usage examples
```

## Agents

### News Article Writer (`newsArticleWriterAgent`)
- Uses GPT-4o for high-quality article generation
- Fetches news, analyzes sources, and creates original content
- Can produce structured output with headlines, tags, and sources

### News Summarizer (`newsSummarizerAgent`)
- Uses GPT-4o-mini for quick summaries
- Creates concise news briefs
- Ideal for quick overviews

## Tools

### `fetchNewsTool`
Fetches news articles from:
1. NewsAPI (with API key)
2. GNews (with API key)
3. Google News RSS (fallback, no key required)

### `fetchArticleContentTool`
Fetches and extracts content from article URLs for deeper analysis.

## License

MIT

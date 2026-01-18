import { createTool } from "@mastra/core/tools";
import { Agent } from "@mastra/core/agent";
import { Mastra } from "@mastra/core/mastra";
import { z } from "zod";
import { initMemgraph, closeDriver } from "../db/memgraph";
import { saveLesson } from "./lesson.repository";

// ============================================================================
// SCHEMAS
// ============================================================================

const NewsArticleSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  content: z.string().nullable(),
  url: z.string(),
  source: z.string(),
  publishedAt: z.string(),
  author: z.string().nullable(),
});

export type NewsArticle = z.infer<typeof NewsArticleSchema>;

// Vocabulary word schema
const VocabularyWordSchema = z.object({
  word: z.string().describe("The vocabulary word"),
  pronunciation: z.string().describe("IPA pronunciation with syllable emphasis, e.g., /ɪkˈsplɔɪt/ [ik-SPLOIT]"),
  partOfSpeech: z.string().describe("Part of speech (n., v., adj., adv., etc.)"),
  definition: z.string().describe("Clear, simple definition of the word"),
  exampleSentence: z.string().describe("An example sentence using the word"),
  additionalInfo: z.string().nullable().describe("Related words, antonyms, or additional usage notes. Null if none."),
});

// Comprehension question schema
const ComprehensionQuestionSchema = z.object({
  question: z.string().describe("A comprehension question about the article"),
  answer: z.string().describe("The answer to the comprehension question"),
});

// Lesson output schema
export const LessonOutputSchema = z.object({
  // Header
  title: z.string().describe("An engaging, descriptive headline for the article (should be original but based on the news)"),
  postedDate: z.string().describe("The date the article was posted in format: Month Day, Year"),
  category: z.string().describe("Article category (e.g., Business, Technology, Science, Politics, Entertainment, Health, Sports, Environment)"),
  
  // Warm-up Questions
  warmUpQuestions: z.array(z.string()).describe("2-3 warm-up questions to engage the student before reading"),
  
  // Vocabulary
  vocabulary: z.array(VocabularyWordSchema).min(5).max(5).describe("Exactly 5 vocabulary words from the article with definitions and pronunciations"),
  
  // Article Content
  articleContent: z.object({
    paragraphs: z.array(z.object({
      text: z.string().describe("A paragraph of the article"),
      comprehensionQuestion: ComprehensionQuestionSchema.nullable().describe("Optional comprehension question after this paragraph, null if none"),
    })).min(7).max(8).describe("The article broken into 7-8 paragraphs with optional comprehension questions"),
    source: z.string().describe("The source attribution (e.g., 'This article was provided by The Associated Press.')"),
  }),
  
  // Summary Question
  summaryQuestion: z.string().describe("A question to check if the student can summarize the article"),
  
  // Discussion Questions
  discussionA: z.object({
    topic: z.string().describe("Brief description of discussion topic A"),
    questions: z.array(z.string()).describe("2-3 discussion questions for topic A"),
  }),
  discussionB: z.object({
    topic: z.string().describe("Brief description of discussion topic B"),
    questions: z.array(z.string()).describe("2-3 discussion questions for topic B"),
  }),
});

export type LessonOutput = z.infer<typeof LessonOutputSchema>;

// ============================================================================
// TOOLS
// ============================================================================

/**
 * Tool to fetch news from various news APIs
 * Supports: NewsAPI, GNews, Google News RSS (fallback)
 */
export const fetchNewsTool = createTool({
  id: "fetch-news",
  description:
    "Fetches latest news articles from news sources based on a topic or keyword. Use this to gather news content for article creation.",
  inputSchema: z.object({
    topic: z.string().describe("The topic or keyword to search news for"),
    maxArticles: z
      .number()
      .optional()
      .default(5)
      .describe("Maximum number of articles to fetch (default: 5)"),
  }),
  outputSchema: z.object({
    articles: z.array(NewsArticleSchema),
    totalResults: z.number(),
    query: z.string(),
  }),
  execute: async ({ context }) => {
    const { topic, maxArticles = 5 } = context;

    // Option 1: Using NewsAPI (requires NEWSAPI_KEY in .env)
    const newsApiKey = process.env.NEWSAPI_KEY;

    if (newsApiKey) {
      try {
        const response = await fetch(
          `https://newsapi.org/v2/everything?q=${encodeURIComponent(topic)}&sortBy=publishedAt&pageSize=${maxArticles}&apiKey=${newsApiKey}`
        );
        const data = (await response.json()) as {
          status: string;
          articles: any[];
          totalResults: number;
        };

        if (data.status === "ok") {
          const articles: NewsArticle[] = data.articles.map((article: any) => ({
            title: article.title || "",
            description: article.description || null,
            content: article.content || null,
            url: article.url || "",
            source: article.source?.name || "Unknown",
            publishedAt: article.publishedAt || new Date().toISOString(),
            author: article.author || null,
          }));

          return {
            articles,
            totalResults: data.totalResults,
            query: topic,
          };
        }
      } catch (error) {
        console.error("NewsAPI fetch failed:", error);
      }
    }

    // Option 2: Using GNews API (requires GNEWS_KEY in .env)
    const gnewsKey = process.env.GNEWS_KEY;

    if (gnewsKey) {
      try {
        const response = await fetch(
          `https://gnews.io/api/v4/search?q=${encodeURIComponent(topic)}&max=${maxArticles}&apikey=${gnewsKey}`
        );
        const data = (await response.json()) as {
          articles?: any[];
          totalArticles?: number;
        };

        if (data.articles) {
          const articles: NewsArticle[] = data.articles.map((article: any) => ({
            title: article.title || "",
            description: article.description || null,
            content: article.content || null,
            url: article.url || "",
            source: article.source?.name || "Unknown",
            publishedAt: article.publishedAt || new Date().toISOString(),
            author: null,
          }));

          return {
            articles,
            totalResults: data.totalArticles || articles.length,
            query: topic,
          };
        }
      } catch (error) {
        console.error("GNews fetch failed:", error);
      }
    }

    // Option 3: Fallback - Google News RSS feed (no API key required)
    try {
      const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-US&gl=US&ceid=US:en`;
      const response = await fetch(rssUrl);
      const xmlText = await response.text();

      const articles: NewsArticle[] = [];
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
        const publishedAt = pubDateMatch?.[1] || new Date().toISOString();
        const source = sourceMatch?.[1] || "Google News";

        if (title && url) {
          articles.push({
            title,
            description: null,
            content: null,
            url,
            source,
            publishedAt,
            author: null,
          });
          count++;
        }
      }

      return {
        articles,
        totalResults: articles.length,
        query: topic,
      };
    } catch (error) {
      console.error("RSS fetch failed:", error);
    }

    return {
      articles: [],
      totalResults: 0,
      query: topic,
    };
  },
});

/**
 * Tool to fetch full article content from a URL
 */
export const fetchArticleContentTool = createTool({
  id: "fetch-article-content",
  description:
    "Fetches the full content of an article from its URL. Use this when you need more detailed content from a specific article.",
  inputSchema: z.object({
    url: z.string().url().describe("The URL of the article to fetch"),
  }),
  outputSchema: z.object({
    title: z.string(),
    content: z.string(),
    url: z.string(),
    success: z.boolean(),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const { url } = context;

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      });

      const html = await response.text();

      const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
      const title = titleMatch?.[1] || "";

      let content = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
        .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "");

      const articleMatch = content.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
      if (articleMatch && articleMatch[1]) {
        content = articleMatch[1];
      }

      content = content
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 5000);

      return {
        title,
        content,
        url,
        success: true,
      };
    } catch (error) {
      return {
        title: "",
        content: "",
        url,
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch article",
      };
    }
  },
});

// ============================================================================
// AGENTS
// ============================================================================

/**
 * Lesson Generator Agent - Creates educational lessons from news articles
 * This is the main agent for generating structured lesson content
 */
export const lessonGeneratorAgent = new Agent({
  name: "lesson-generator",
  instructions: `You are an expert ESL/English lesson content creator who transforms news articles into engaging educational materials for English language learners.

Your task is to:
1. FIRST use the fetchNewsTool to gather current news on the requested topic
2. If needed, use fetchArticleContentTool to get more details from specific articles
3. Create an ORIGINAL educational lesson based on the news you gathered

CRITICAL REQUIREMENTS:

**Title Creation:**
- Create an engaging, descriptive headline that captures the essence of the news
- The title should be original but accurately represent the news content
- Example format: "Merriam-Webster Names 'Slop' as 2025 Word of the Year, Reflecting AI's Impact on Digital Content"

**Warm-up Questions (2-3 questions):**
- Create questions that connect the topic to the student's personal experience
- Questions should be thought-provoking and spark deeper discussion
- Examples: "How do you typically identify whether content online is real or fake?", "What role does AI play in your daily life?"

**Vocabulary Section (exactly 5 words):**
- Select 5 sophisticated, academic, or domain-specific words FROM the article content you write
- Choose words that a C1-level learner would benefit from mastering
- For each word provide:
  - IPA pronunciation with syllable stress (e.g., /prəˌlɪfəˈreɪʃən/ [proh-lif-uh-REY-shuhn])
  - Part of speech (v., n., adj., etc.)
  - Clear, nuanced definition
  - Example sentence showing proper usage in context (different from the article)
  - Additional info (collocations, synonyms, antonyms, register notes, common phrases)

**Article Content:**
- Write an ORIGINAL, IN-DEPTH article based on the news you gathered (DO NOT copy verbatim)
- The article MUST have exactly 7-8 paragraphs (no more, no less)
- Each paragraph MUST be 5-7 sentences long (approximately 80-120 words per paragraph)

ARTICLE DEPTH REQUIREMENTS (CRITICAL):
- Include DIRECT QUOTES from key figures, experts, or stakeholders (use quotation marks)
- Provide HISTORICAL CONTEXT - how did we get here? What's the origin or background?
- Include SPECIFIC EXAMPLES, names, products, or events (e.g., "AI video generators like Sora", "clips depicting celebrities")
- Use VIVID, DESCRIPTIVE LANGUAGE that paints a picture (e.g., "evokes unpleasant images of mud-caked pigs crowding around a dirty trough")
- Present MULTIPLE PERSPECTIVES - show different viewpoints or reactions to the topic
- Explain the METHODOLOGY or process where relevant (e.g., "To select the word of the year, the dictionary's editors review data...")
- Include ANALYSIS of implications, not just facts - what does this mean for the future?
- Add EMOTIONAL or HUMAN elements - how do people feel about this? What are their hopes or fears?

- Include exactly 3 comprehension questions, placed after every 2-3 paragraphs
  - Question 1: After paragraph 2 or 3
  - Question 2: After paragraph 4 or 5  
  - Question 3: After paragraph 6 or 7
- Comprehension questions should:
  - Be answerable directly from the text
  - Use format: "Q: [Question]?" followed by "A: [Answer from text]"
  - Test specific details, not general understanding
- End with source attribution: "This article was provided by [Source]."

**Summary Question:**
- A question that requires synthesizing the main ideas
- Example: "What was the article about?"

**Discussion Questions (2 topics, 2-3 questions each):**
CRITICAL: Discussion questions must be MULTI-LAYERED and THOUGHT-PROVOKING:

Discussion A format:
- Start with a specific point from the article, then ask for opinion with "Do you think...? Why or why not?"
- Follow with "In your opinion, what are some reasons...?" or "What factors might...?"
- End with "Discuss." to encourage elaboration
- Example: "The article says 'slop' first meant 'soft mud' in the 1700s, but it has now expanded to mean 'low-quality digital content.' Do you think it is natural for words to change meaning over time? Why or why not? In your opinion, what are some reasons a word might change its meaning? Discuss."

Discussion B format:
- Connect the topic to the student's personal experience or their country/language
- Ask for agreement/disagreement with reasoning
- Suggest alternative viewpoints for them to consider
- Example: "Do you agree with [the choice/decision/statement]? Why or why not? In your opinion, what other [alternative] do you think would be a good choice? Why do you think this is important or meaningful? Discuss."

ARTICLE WRITING GUIDELINES:
- Write at an ADVANCED English level (C1 CEFR)
- Use sophisticated vocabulary, complex sentence structures, and cohesive devices
- Each paragraph should develop ONE main idea with substantial supporting details, examples, and analysis
- MUST include at least 2-3 direct quotes from experts or key figures
- Present balanced, nuanced perspectives while maintaining journalistic objectivity
- Use transitions to create logical flow between paragraphs
- Article should be 900-1100 words across 7-8 paragraphs (about 115-140 words per paragraph)
- Write with the depth and quality of a well-researched newspaper feature article`,

  model: "openai/gpt-4o",
  tools: {
    fetchNewsTool,
    fetchArticleContentTool,
  },
});

/**
 * News Article Writer Agent - Uses GPT-4o for high-quality article generation
 */
export const newsArticleWriterAgent = new Agent({
  name: "news-article-writer",
  instructions: `You are a professional journalist and content writer specializing in creating engaging, informative articles.

Your capabilities:
1. Research news topics using the fetchNewsTool to gather current news articles
2. Fetch detailed content from specific articles using fetchArticleContentTool when needed
3. Synthesize information from multiple sources into original, well-written articles

Guidelines for writing articles:
- ALWAYS use the fetchNewsTool first to gather news on the requested topic
- Create ORIGINAL content - do not copy verbatim from sources
- Synthesize information from multiple sources when available
- Write in a professional, engaging journalistic style
- Include proper attribution when referencing specific facts or quotes
- Structure articles with:
  - A compelling headline
  - An engaging lead paragraph (who, what, when, where, why)
  - Body paragraphs with supporting details
  - Context and background information
  - A conclusion or forward-looking statement
- Maintain objectivity and present balanced perspectives
- If sources conflict, acknowledge different viewpoints
- Always cite your sources at the end of the article

Article formats you can create:
- News summaries
- In-depth analysis
- Feature articles
- Opinion pieces (when specifically requested)
- Listicles
- Breaking news updates

When asked to write an article:
1. First, use fetchNewsTool to gather recent news on the topic
2. If more detail is needed, use fetchArticleContentTool on specific URLs
3. Analyze and synthesize the gathered information
4. Write an original article that provides value to readers
5. Include source references at the end`,

  model: "openai/gpt-4o",
  tools: {
    fetchNewsTool,
    fetchArticleContentTool,
  },
});

/**
 * News Summarizer Agent - Uses GPT-4o-mini for quick summaries
 */
export const newsSummarizerAgent = new Agent({
  name: "news-summarizer",
  instructions: `You are a news editor specializing in creating concise, accurate news summaries.

Your role:
- Gather news using the fetchNewsTool
- Create brief, informative summaries of current events
- Highlight key points and developments
- Present information in an easy-to-digest format

Output format:
- Use bullet points for quick summaries
- Keep summaries under 200 words unless otherwise specified
- Include publication date/time context
- Note any conflicting reports or unverified claims
- Always cite sources`,

  model: "openai/gpt-4o-mini",
  tools: {
    fetchNewsTool,
  },
});

// ============================================================================
// MASTRA INSTANCE
// ============================================================================

export const mastra = new Mastra({
  agents: {
    lessonGeneratorAgent,
    newsArticleWriterAgent,
    newsSummarizerAgent,
  },
});

// ============================================================================
// LESSON GENERATION SERVICE
// ============================================================================

/**
 * Generate an educational lesson from a news topic
 */
export async function generateLesson(topic: string): Promise<LessonOutput> {
  const agent = mastra.getAgent("lessonGeneratorAgent");

  const result = await agent.generate(
    `Create a complete educational English lesson about the following news topic: "${topic}"
    
    First, use the fetchNewsTool to gather current news about this topic.
    Then create an original, educational lesson following the structured format.
    
    Remember:
    - The article must be ORIGINAL (not copied from sources)
    - Include exactly 5 vocabulary words with pronunciations
    - Include 2-3 warm-up questions
    - Include comprehension questions within the article
    - Include discussion questions for two topics`,
    {
      structuredOutput: {
        schema: LessonOutputSchema,
      },
    }
  );

  return result.object as LessonOutput;
}

/**
 * Format a lesson for display/printing
 */
export function formatLesson(lesson: LessonOutput): string {
  let output = "";

  // Title and metadata
  output += "═".repeat(80) + "\n";
  output += `${lesson.title}\n`;
  output += "═".repeat(80) + "\n\n";
  output += `Published: ${lesson.postedDate}\n`;
  output += `Topic: ${lesson.category}\n\n`;

  // Conversation Starters
  output += "─".repeat(40) + "\n";
  output += "CONVERSATION STARTERS\n";
  output += "─".repeat(40) + "\n";
  output += "Begin with these introductory questions:\n\n";
  for (const question of lesson.warmUpQuestions) {
    output += `  - ${question}\n`;
  }
  output += "\n";

  // Key Vocabulary
  output += "─".repeat(40) + "\n";
  output += "KEY VOCABULARY\n";
  output += "─".repeat(40) + "\n";
  output += "Review the following words and their meanings:\n\n";
  for (const vocab of lesson.vocabulary) {
    output += `${vocab.word} ${vocab.pronunciation} (${vocab.partOfSpeech})\n`;
    output += `   Meaning: ${vocab.definition}\n`;
    output += `   Usage: ${vocab.exampleSentence}\n`;
    if (vocab.additionalInfo) {
      output += `   Note: ${vocab.additionalInfo}\n`;
    }
    output += "\n";
  }

  // Reading Passage
  output += "─".repeat(40) + "\n";
  output += "READING PASSAGE\n";
  output += "─".repeat(40) + "\n";
  output += "Read the following article:\n\n";
  
  for (const para of lesson.articleContent.paragraphs) {
    output += `${para.text}\n\n`;
    if (para.comprehensionQuestion) {
      output += `   Q: ${para.comprehensionQuestion.question}\n`;
      output += `   A: ${para.comprehensionQuestion.answer}\n\n`;
    }
  }
  output += `\n${lesson.articleContent.source}\n\n`;

  // Comprehension Check
  output += "─".repeat(40) + "\n";
  output += "COMPREHENSION CHECK\n";
  output += "─".repeat(40) + "\n";
  output += `${lesson.summaryQuestion}\n\n`;

  // Discussion Topics
  output += "─".repeat(40) + "\n";
  output += "DISCUSSION TOPICS\n";
  output += "─".repeat(40) + "\n\n";
  
  output += `Topic A: ${lesson.discussionA.topic}\n`;
  for (const q of lesson.discussionA.questions) {
    output += `  • ${q}\n`;
  }
  output += "\n";
  
  output += `Topic B: ${lesson.discussionB.topic}\n`;
  for (const q of lesson.discussionB.questions) {
    output += `  • ${q}\n`;
  }
  output += "\n";

  return output;
}

/**
 * Generate lesson and return as JSON
 */
export async function generateLessonJSON(topic: string): Promise<string> {
  const lesson = await generateLesson(topic);
  return JSON.stringify(lesson, null, 2);
}

// ============================================================================
// DISPATCH SERVICE
// ============================================================================

export interface DispatchConfig {
  topics: string[];
  outputFormat: "summary" | "article" | "structured";
  maxArticlesPerTopic?: number;
}

export interface DispatchResult {
  topic: string;
  content: string;
  generatedAt: Date;
  success: boolean;
  error?: string;
}

/**
 * Generate daily news dispatch for given topics
 */
export async function generateDailyDispatch(
  config: DispatchConfig
): Promise<DispatchResult[]> {
  const results: DispatchResult[] = [];

  for (const topic of config.topics) {
    try {
      let content: string;

      if (config.outputFormat === "summary") {
        const agent = mastra.getAgent("newsSummarizerAgent");
        const result = await agent.generate(
          `Give me a summary of the latest news about: ${topic}`
        );
        content = result.text;
      } else {
        const agent = mastra.getAgent("newsArticleWriterAgent");
        const result = await agent.generate(
          `Write a comprehensive article about the latest developments in: ${topic}`
        );
        content = result.text;
      }

      results.push({
        topic,
        content,
        generatedAt: new Date(),
        success: true,
      });
    } catch (error) {
      results.push({
        topic,
        content: "",
        generatedAt: new Date(),
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return results;
}

/**
 * Stream article generation for real-time updates
 */
export async function* streamArticleGeneration(topic: string) {
  const agent = mastra.getAgent("newsArticleWriterAgent");
  const stream = await agent.stream(`Write a news article about: ${topic}`);

  for await (const chunk of stream.textStream) {
    yield chunk;
  }
}

/**
 * Generate a single article on a topic
 */
export async function generateArticle(topic: string): Promise<string> {
  const agent = mastra.getAgent("newsArticleWriterAgent");
  const result = await agent.generate(
    `Write an in-depth article about: ${topic}`
  );
  return result.text;
}

/**
 * Generate a quick news summary on a topic
 */
export async function generateSummary(topic: string): Promise<string> {
  const agent = mastra.getAgent("newsSummarizerAgent");
  const result = await agent.generate(
    `Give me a summary of the latest news about: ${topic}`
  );
  return result.text;
}

/**
 * Generate article with structured output
 */
export async function generateStructuredArticle(topic: string) {
  const agent = mastra.getAgent("newsArticleWriterAgent");

  const result = await agent.generate(
    `Write an article about the latest news on: ${topic}`,
    {
      structuredOutput: {
        schema: z.object({
          headline: z.string().describe("A compelling headline for the article"),
          summary: z.string().describe("A 2-3 sentence summary of the article"),
          body: z.string().describe("The full article body"),
          tags: z.array(z.string()).describe("Relevant tags for the article"),
          sources: z
            .array(
              z.object({
                name: z.string(),
                url: z.string(),
              })
            )
            .describe("Sources referenced in the article"),
        }),
      },
    }
  );

  return result.object;
}

// ============================================================================
// NEWS CATEGORIES FOR RANDOM SELECTION
// ============================================================================

const NEWS_CATEGORIES: string[] = [
  // Technology
  "artificial intelligence breakthroughs",
  "latest smartphone technology",
  "cybersecurity threats",
  "space exploration news",
  "electric vehicles",
  "social media trends",
  
  // Business
  "stock market news",
  "startup funding",
  "corporate mergers acquisitions",
  "cryptocurrency market",
  "global trade",
  
  // Science
  "climate change research",
  "medical breakthroughs",
  "renewable energy",
  "scientific discoveries",
  "ocean exploration",
  
  // Entertainment
  "movie releases",
  "music industry news",
  "streaming platforms",
  "video game releases",
  
  // Sports
  "football championship",
  "basketball NBA news",
  "tennis grand slam",
  "olympic games",
  "soccer world cup",
  
  // Health & Wellness
  "mental health awareness",
  "fitness trends",
  "nutrition research",
  "healthy lifestyle tips",
  
  // Environment
  "wildlife conservation",
  "sustainable living",
  "national parks",
  "marine life discoveries",
  
  // Lifestyle
  "travel destinations",
  "food trends",
  "fashion industry",
  "home improvement",
  "personal finance tips",
  
  // Education
  "online learning trends",
  "study abroad programs",
  "educational technology",
];

/**
 * Get a random news category/topic
 */
export function getRandomNewsTopic(): string {
  const randomIndex = Math.floor(Math.random() * NEWS_CATEGORIES.length);
  return NEWS_CATEGORIES[randomIndex] ?? "technology news";
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

if (import.meta.main) {
  const args = process.argv.slice(2);
  const command = args[0] || "lesson";
  
  // Use provided topic or get a random one
  const providedTopic = args.slice(1).join(" ");
  const topic = providedTopic || getRandomNewsTopic();

  console.log("=".repeat(60));
  console.log("FluentXVerse - News Dispatch Service");
  console.log("=".repeat(60));
  console.log();

  switch (command) {
    case "lesson":
      if (!providedTopic) {
        console.log(`🎲 Random topic selected: ${topic}\n`);
      }
      console.log(`📚 Generating educational lesson about: ${topic}\n`);
      console.log("This may take a moment...\n");
      try {
        const lesson = await generateLesson(topic);
        console.log(formatLesson(lesson));
      } catch (error) {
        console.error("Error generating lesson:", error);
      }
      break;

    case "lesson-json":
      if (!providedTopic) {
        console.log(`🎲 Random topic selected: ${topic}\n`);
      }
      console.log(`📚 Generating lesson JSON about: ${topic}\n`);
      try {
        const lessonJson = await generateLessonJSON(topic);
        console.log(lessonJson);
      } catch (error) {
        console.error("Error generating lesson:", error);
      }
      break;

    case "article":
      console.log(`📰 Generating article about: ${topic}\n`);
      const article = await generateArticle(topic);
      console.log(article);
      break;

    case "summary":
      console.log(`📋 Generating summary about: ${topic}\n`);
      const summary = await generateSummary(topic);
      console.log(summary);
      break;

    case "structured":
      console.log(`🎯 Generating structured article about: ${topic}\n`);
      const structured = await generateStructuredArticle(topic);
      console.log(JSON.stringify(structured, null, 2));
      break;

    case "dispatch":
      console.log(`📨 Running daily dispatch...\n`);
      const dispatch = await generateDailyDispatch({
        topics: ["AI technology", "climate change"],
        outputFormat: "summary",
      });
      for (const result of dispatch) {
        console.log(`\n📰 Topic: ${result.topic}`);
        console.log("-".repeat(40));
        console.log(result.content);
      }
      break;

    case "stream":
      console.log(`🔄 Streaming article about: ${topic}\n`);
      for await (const chunk of streamArticleGeneration(topic)) {
        process.stdout.write(chunk);
      }
      console.log("\n");
      break;

    case "lesson-save":
      if (!providedTopic) {
        console.log(`🎲 Random topic selected: ${topic}\n`);
      }
      console.log(`📚 Generating and SAVING lesson about: ${topic}\n`);
      console.log("This may take a moment...\n");
      try {
        // Initialize Memgraph
        console.log("⏳ Connecting to Memgraph...");
        await initMemgraph();
        console.log("✅ Memgraph connected\n");

        // Generate the lesson
        const lessonToSave = await generateLesson(topic);
        console.log(formatLesson(lessonToSave));

        // Save to Memgraph
        console.log("\n⏳ Saving to Memgraph...");
        const savedLesson = await saveLesson(lessonToSave, topic);
        console.log(`✅ Saved to Memgraph with ID: ${savedLesson.id}`);

        // Close connection
        await closeDriver();
      } catch (error) {
        console.error("Error generating/saving lesson:", error);
        await closeDriver();
      }
      break;

    default:
      console.log("Available commands:");
      console.log("  bun run lesson              - Generate lesson with RANDOM topic");
      console.log("  bun run lesson [topic]      - Generate lesson with specific topic");
      console.log("  bun run lesson:save         - Generate & SAVE to Memgraph (random topic)");
      console.log("  bun run lesson:save [topic] - Generate & SAVE to Memgraph (specific topic)");
      console.log("  bun run lesson:json         - Generate lesson JSON with RANDOM topic");
      console.log("  bun run lesson:json [topic] - Generate lesson JSON with specific topic");
      console.log("  bun run article [topic]     - Generate news article");
      console.log("  bun run summary [topic]     - Generate news summary");
      console.log("\nExamples:");
      console.log("  bun run lesson                        - Random topic lesson");
      console.log("  bun run lesson:save                   - Random topic, save to DB");
      console.log("  bun run lesson:save Disney OpenAI     - Specific topic, save to DB");
      console.log("  bun run lesson:json climate change    - JSON output");
  }
}
import { getDriver } from "../db/memgraph";
import { v4 as uuidv4 } from "uuid";
import type {
  StoredLesson,
  LessonInput,
  LessonSearchParams,
} from "./lesson.types";

// Re-export types for convenience
export type {
  VocabularyWord,
  ComprehensionQuestion,
  Paragraph,
  ArticleContent,
  Discussion,
  StoredLesson,
  LessonSearchParams,
  LessonInput,
} from "./lesson.types";

// ============================================================================
// SAVE DISPATCH ARTICLE
// ============================================================================

/**
 * Save a dispatch article to Memgraph
 * All lesson data is stored in a single DispatchArticle node
 */
export async function saveLesson(
  lesson: LessonInput,
  topic: string
): Promise<StoredLesson> {
  const driver = getDriver();
  const session = driver.session();
  const articleId = uuidv4();
  const now = new Date().toISOString();

  try {
    // Create a single DispatchArticle node with all data
    await session.run(
      `
      CREATE (a:DispatchArticle {
        id: $id,
        title: $title,
        postedDate: $postedDate,
        category: $category,
        topic: $topic,
        warmUpQuestions: $warmUpQuestions,
        vocabulary: $vocabulary,
        articleContent: $articleContent,
        summaryQuestion: $summaryQuestion,
        discussionA: $discussionA,
        discussionB: $discussionB,
        createdAt: $createdAt,
        updatedAt: $updatedAt
      })
      RETURN a
      `,
      {
        id: articleId,
        title: lesson.title,
        postedDate: lesson.postedDate,
        category: lesson.category,
        topic: topic,
        warmUpQuestions: JSON.stringify(lesson.warmUpQuestions),
        vocabulary: JSON.stringify(lesson.vocabulary),
        articleContent: JSON.stringify(lesson.articleContent),
        summaryQuestion: lesson.summaryQuestion,
        discussionA: JSON.stringify(lesson.discussionA),
        discussionB: JSON.stringify(lesson.discussionB),
        createdAt: now,
        updatedAt: now,
      }
    );

    console.log(`✅ DispatchArticle saved to Memgraph with ID: ${articleId}`);

    return {
      ...lesson,
      id: articleId,
      topic,
      createdAt: now,
      updatedAt: now,
    };
  } catch (error) {
    console.error("❌ Error saving DispatchArticle to Memgraph:", error);
    throw error;
  } finally {
    await session.close();
  }
}

// ============================================================================
// GET DISPATCH ARTICLE BY ID
// ============================================================================

/**
 * Get a dispatch article by its ID from Memgraph
 */
export async function getLessonById(
  articleId: string
): Promise<StoredLesson | null> {
  const driver = getDriver();
  const session = driver.session();

  try {
    const result = await session.run(
      `
      MATCH (a:DispatchArticle {id: $articleId})
      RETURN a
      `,
      { articleId }
    );

    if (result.records.length === 0) {
      return null;
    }

    const node = result.records[0]?.get("a").properties;

    return {
      id: node.id,
      title: node.title,
      postedDate: node.postedDate,
      category: node.category,
      topic: node.topic,
      warmUpQuestions: JSON.parse(node.warmUpQuestions),
      vocabulary: JSON.parse(node.vocabulary),
      articleContent: JSON.parse(node.articleContent),
      summaryQuestion: node.summaryQuestion,
      discussionA: JSON.parse(node.discussionA),
      discussionB: JSON.parse(node.discussionB),
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
    };
  } catch (error) {
    console.error("❌ Error getting DispatchArticle from Memgraph:", error);
    throw error;
  } finally {
    await session.close();
  }
}

// ============================================================================
// GET ALL DISPATCH ARTICLES
// ============================================================================

/**
 * Get all dispatch articles with optional filtering
 */
export async function getLessons(
  params: LessonSearchParams = {}
): Promise<StoredLesson[]> {
  const driver = getDriver();
  const session = driver.session();

  const { category, topic, startDate, endDate, limit = 20, offset = 0 } = params;

  try {
    let whereClause = "";
    const queryParams: Record<string, any> = { limit, offset };

    const conditions: string[] = [];

    if (category) {
      conditions.push("a.category = $category");
      queryParams.category = category;
    }

    if (topic) {
      conditions.push("a.topic CONTAINS $topic");
      queryParams.topic = topic;
    }

    if (startDate) {
      conditions.push("a.createdAt >= $startDate");
      queryParams.startDate = startDate;
    }

    if (endDate) {
      conditions.push("a.createdAt <= $endDate");
      queryParams.endDate = endDate;
    }

    if (conditions.length > 0) {
      whereClause = "WHERE " + conditions.join(" AND ");
    }

    const result = await session.run(
      `
      MATCH (a:DispatchArticle)
      ${whereClause}
      RETURN a
      ORDER BY a.createdAt DESC
      SKIP $offset
      LIMIT $limit
      `,
      queryParams
    );

    return result.records.map((record) => {
      const node = record.get("a").properties;
      return {
        id: node.id,
        title: node.title,
        postedDate: node.postedDate,
        category: node.category,
        topic: node.topic,
        warmUpQuestions: JSON.parse(node.warmUpQuestions),
        vocabulary: JSON.parse(node.vocabulary),
        articleContent: JSON.parse(node.articleContent),
        summaryQuestion: node.summaryQuestion,
        discussionA: JSON.parse(node.discussionA),
        discussionB: JSON.parse(node.discussionB),
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
      };
    });
  } catch (error) {
    console.error("❌ Error getting DispatchArticles from Memgraph:", error);
    throw error;
  } finally {
    await session.close();
  }
}

// ============================================================================
// GET DISPATCH ARTICLES BY CATEGORY
// ============================================================================

/**
 * Get all dispatch articles in a specific category
 */
export async function getLessonsByCategory(
  category: string,
  limit: number = 20
): Promise<StoredLesson[]> {
  return getLessons({ category, limit });
}

// ============================================================================
// GET RECENT DISPATCH ARTICLES
// ============================================================================

/**
 * Get the most recent dispatch articles
 */
export async function getRecentLessons(
  limit: number = 10
): Promise<StoredLesson[]> {
  return getLessons({ limit });
}

// ============================================================================
// DELETE DISPATCH ARTICLE
// ============================================================================

/**
 * Delete a dispatch article
 */
export async function deleteLesson(articleId: string): Promise<boolean> {
  const driver = getDriver();
  const session = driver.session();

  try {
    await session.run(
      `
      MATCH (a:DispatchArticle {id: $articleId})
      DETACH DELETE a
      `,
      { articleId }
    );

    console.log(`✅ DispatchArticle ${articleId} deleted from Memgraph`);
    return true;
  } catch (error) {
    console.error("❌ Error deleting DispatchArticle from Memgraph:", error);
    throw error;
  } finally {
    await session.close();
  }
}

// ============================================================================
// SEARCH DISPATCH ARTICLES
// ============================================================================

/**
 * Full-text search for dispatch articles by title or topic
 */
export async function searchLessons(
  searchTerm: string,
  limit: number = 20
): Promise<StoredLesson[]> {
  const driver = getDriver();
  const session = driver.session();

  try {
    const result = await session.run(
      `
      MATCH (a:DispatchArticle)
      WHERE a.title CONTAINS $searchTerm 
         OR a.topic CONTAINS $searchTerm
         OR a.category CONTAINS $searchTerm
      RETURN a
      ORDER BY a.createdAt DESC
      LIMIT $limit
      `,
      { searchTerm, limit }
    );

    return result.records.map((record) => {
      const node = record.get("a").properties;
      return {
        id: node.id,
        title: node.title,
        postedDate: node.postedDate,
        category: node.category,
        topic: node.topic,
        warmUpQuestions: JSON.parse(node.warmUpQuestions),
        vocabulary: JSON.parse(node.vocabulary),
        articleContent: JSON.parse(node.articleContent),
        summaryQuestion: node.summaryQuestion,
        discussionA: JSON.parse(node.discussionA),
        discussionB: JSON.parse(node.discussionB),
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
      };
    });
  } catch (error) {
    console.error("❌ Error searching DispatchArticles in Memgraph:", error);
    throw error;
  } finally {
    await session.close();
  }
}

// ============================================================================
// GET DISPATCH ARTICLE STATISTICS
// ============================================================================

/**
 * Get statistics about stored dispatch articles
 */
export async function getLessonStats(): Promise<{
  totalLessons: number;
  categoryCounts: Record<string, number>;
  recentLessons: number;
}> {
  const driver = getDriver();
  const session = driver.session();

  try {
    // Total articles
    const totalResult = await session.run(`
      MATCH (a:DispatchArticle)
      RETURN count(a) as total
    `);
    const totalLessons = totalResult.records[0]?.get("total")?.toNumber() || 0;

    // Count by category
    const categoryResult = await session.run(`
      MATCH (a:DispatchArticle)
      RETURN a.category as category, count(a) as count
      ORDER BY count DESC
    `);
    const categoryCounts: Record<string, number> = {};
    for (const record of categoryResult.records) {
      const category = record.get("category");
      const count = record.get("count").toNumber();
      categoryCounts[category] = count;
    }

    // Articles in last 7 days
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();
    const recentResult = await session.run(
      `
      MATCH (a:DispatchArticle)
      WHERE a.createdAt >= $sevenDaysAgo
      RETURN count(a) as recent
      `,
      { sevenDaysAgo }
    );
    const recentLessons =
      recentResult.records[0]?.get("recent")?.toNumber() || 0;

    return {
      totalLessons,
      categoryCounts,
      recentLessons,
    };
  } catch (error) {
    console.error(
      "❌ Error getting DispatchArticle stats from Memgraph:",
      error
    );
    throw error;
  } finally {
    await session.close();
  }
}

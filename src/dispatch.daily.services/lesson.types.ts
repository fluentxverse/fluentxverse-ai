// ============================================================================
// LESSON TYPES
// ============================================================================

export interface VocabularyWord {
  word: string;
  pronunciation: string;
  partOfSpeech: string;
  definition: string;
  exampleSentence: string;
  additionalInfo: string | null;
}

export interface ComprehensionQuestion {
  question: string;
  answer: string;
}

export interface Paragraph {
  text: string;
  comprehensionQuestion: ComprehensionQuestion | null;
}

export interface ArticleContent {
  paragraphs: Paragraph[];
  source: string;
}

export interface Discussion {
  topic: string;
  questions: string[];
}

export interface StoredLesson {
  // Database fields
  id: string;
  createdAt: string;
  updatedAt: string;

  // Lesson metadata
  title: string;
  postedDate: string;
  category: string;
  topic: string;

  // Warm-up section
  warmUpQuestions: string[];

  // Vocabulary section (5 words)
  vocabulary: VocabularyWord[];

  // Article section (7-8 paragraphs)
  articleContent: ArticleContent;

  // Summary question
  summaryQuestion: string;

  // Discussion sections
  discussionA: Discussion;
  discussionB: Discussion;
}

export interface LessonSearchParams {
  category?: string;
  topic?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

// Type alias for input (lesson without DB fields)
export type LessonInput = Omit<
  StoredLesson,
  "id" | "createdAt" | "updatedAt" | "topic"
>;

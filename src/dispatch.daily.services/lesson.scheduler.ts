import { generateLesson, getRandomNewsTopic } from "./dispatch.daily.service";
import { saveLesson } from "./lesson.repository";
import { initMemgraph, closeDriver } from "../db/memgraph";

// ============================================================================
// CONFIGURATION
// ============================================================================

// Philippines timezone is UTC+8
const PHILIPPINES_TIMEZONE = "Asia/Manila";
const PHT_OFFSET_HOURS = 8; // UTC+8
const SCHEDULED_HOUR = 3; // 3 AM PHT
const SCHEDULED_MINUTE = 0;

// ============================================================================
// SCHEDULER UTILITIES
// ============================================================================

/**
 * Get current time components in Philippines timezone (UTC+8)
 */
function getPhilippinesTimeComponents(): { year: number; month: number; day: number; hour: number; minute: number } {
  const now = new Date();
  // Get UTC timestamp and add PHT offset (8 hours in ms)
  const phtTimestamp = now.getTime() + (PHT_OFFSET_HOURS * 60 * 60 * 1000);
  const phtDate = new Date(phtTimestamp);
  
  return {
    year: phtDate.getUTCFullYear(),
    month: phtDate.getUTCMonth(),
    day: phtDate.getUTCDate(),
    hour: phtDate.getUTCHours(),
    minute: phtDate.getUTCMinutes(),
  };
}

/**
 * Calculate milliseconds until next scheduled time (3 AM PHT)
 */
function getMillisecondsUntilNextRun(): number {
  const now = new Date();
  const pht = getPhilippinesTimeComponents();
  
  // Build target time: 3 AM PHT today
  // 3 AM PHT = 3:00 - 8:00 = -5:00 = 19:00 UTC (previous day)
  // So we need: target date at 3 AM PHT, converted to UTC
  
  // Start with today's date in PHT at scheduled hour
  let targetYear = pht.year;
  let targetMonth = pht.month;
  let targetDay = pht.day;
  
  // If we've already passed 3 AM PHT today, schedule for tomorrow
  if (pht.hour >= SCHEDULED_HOUR || (pht.hour === SCHEDULED_HOUR && pht.minute >= SCHEDULED_MINUTE)) {
    // Add one day
    const tempDate = new Date(Date.UTC(targetYear, targetMonth, targetDay + 1));
    targetYear = tempDate.getUTCFullYear();
    targetMonth = tempDate.getUTCMonth();
    targetDay = tempDate.getUTCDate();
  }
  
  // Create target time in UTC
  // 3 AM PHT = 19:00 UTC (previous day) = UTC day before at 19:00
  // Or: 3 AM on day X in PHT = (X-1) day at 19:00 UTC
  // Simpler: target PHT time as UTC timestamp minus 8 hours
  const targetPHTasUTC = Date.UTC(targetYear, targetMonth, targetDay, SCHEDULED_HOUR, SCHEDULED_MINUTE, 0, 0);
  const targetUTC = targetPHTasUTC - (PHT_OFFSET_HOURS * 60 * 60 * 1000);
  
  return targetUTC - now.getTime();
}

/**
 * Get current time as Date (for display purposes using toLocaleString)
 */
function getPhilippinesTime(): Date {
  return new Date();
}

/**
 * Format time for logging
 */
function formatTime(date: Date): string {
  return date.toLocaleString("en-US", {
    timeZone: PHILIPPINES_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

// ============================================================================
// LESSON GENERATION JOB
// ============================================================================

/**
 * Generate and save a lesson to Memgraph
 */
async function generateAndSaveLesson(): Promise<void> {
  const startTime = Date.now();
  const topic = getRandomNewsTopic();

  console.log("═".repeat(60));
  console.log(`📚 SCHEDULED LESSON GENERATION`);
  console.log(`⏰ Time: ${formatTime(getPhilippinesTime())}`);
  console.log(`📰 Topic: ${topic}`);
  console.log("═".repeat(60));

  try {
    // Generate the lesson
    console.log("\n⏳ Generating lesson...");
    const lesson = await generateLesson(topic);
    console.log(`✅ Lesson generated: "${lesson.title}"`);

    // Save to Memgraph
    console.log("\n⏳ Saving to Memgraph...");
    const savedLesson = await saveLesson(lesson, topic);
    console.log(`✅ Saved to Memgraph with ID: ${savedLesson.id}`);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✨ Job completed in ${duration}s`);
    console.log("═".repeat(60));

    return;
  } catch (error) {
    console.error("\n❌ Error in scheduled job:", error);
    throw error;
  }
}

// ============================================================================
// SCHEDULER
// ============================================================================

let schedulerTimeout: Timer | null = null;
let isRunning = false;

/**
 * Schedule the next run
 */
function scheduleNextRun(): void {
  const msUntilNextRun = getMillisecondsUntilNextRun();
  const nextRunTime = new Date(Date.now() + msUntilNextRun);

  console.log(`\n⏰ Next scheduled run: ${formatTime(nextRunTime)}`);
  console.log(
    `   (in ${Math.round(msUntilNextRun / 1000 / 60)} minutes / ${Math.round(msUntilNextRun / 1000 / 60 / 60)} hours)`
  );

  schedulerTimeout = setTimeout(async () => {
    if (!isRunning) {
      isRunning = true;
      try {
        await generateAndSaveLesson();
      } catch (error) {
        console.error("Job failed:", error);
      } finally {
        isRunning = false;
        // Schedule the next run after this one completes
        scheduleNextRun();
      }
    }
  }, msUntilNextRun);
}

/**
 * Start the scheduler
 */
export async function startScheduler(): Promise<void> {
  console.log("═".repeat(60));
  console.log("🚀 LESSON SCHEDULER STARTED");
  console.log(`📍 Timezone: ${PHILIPPINES_TIMEZONE}`);
  console.log(`⏰ Scheduled time: ${SCHEDULED_HOUR}:00 AM PHT daily`);
  console.log(`🕐 Current time: ${formatTime(getPhilippinesTime())}`);
  console.log("═".repeat(60));

  // Initialize Memgraph connection
  try {
    console.log("\n⏳ Connecting to Memgraph...");
    await initMemgraph();
    console.log("✅ Memgraph connected");
  } catch (error) {
    console.error("❌ Failed to connect to Memgraph:", error);
    console.log("⚠️  Scheduler will continue but saving may fail");
  }

  // Schedule the first run
  scheduleNextRun();
}

/**
 * Stop the scheduler
 */
export function stopScheduler(): void {
  if (schedulerTimeout) {
    clearTimeout(schedulerTimeout);
    schedulerTimeout = null;
  }
  console.log("\n🛑 Scheduler stopped");
}

/**
 * Run immediately (for testing)
 */
export async function runNow(): Promise<void> {
  console.log("\n🔄 Running immediate job (manual trigger)...\n");

  try {
    await initMemgraph();
  } catch (error) {
    console.error("❌ Failed to connect to Memgraph:", error);
  }

  await generateAndSaveLesson();
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

const command = process.argv[2];

if (command === "start") {
  // Start the scheduler
  startScheduler();

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\n\n⚠️  Received SIGINT, shutting down...");
    stopScheduler();
    await closeDriver();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("\n\n⚠️  Received SIGTERM, shutting down...");
    stopScheduler();
    await closeDriver();
    process.exit(0);
  });
} else if (command === "run-now") {
  // Run immediately and exit
  runNow()
    .then(async () => {
      await closeDriver();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error("Failed:", error);
      await closeDriver();
      process.exit(1);
    });
} else {
  console.log(`
Lesson Scheduler - Generates lessons daily at 3 AM PHT

Usage:
  bun run scheduler start     Start the scheduler (runs continuously)
  bun run scheduler run-now   Generate a lesson immediately (for testing)

Environment variables:
  MEMGRAPH_URI        Memgraph connection URI (default: bolt://localhost:7687)
  MEMGRAPH_USERNAME   Memgraph username (default: memgraph)
  MEMGRAPH_PASSWORD   Memgraph password (default: memgraph)
  OPENAI_API_KEY      OpenAI API key (required)
  NEWSAPI_KEY         NewsAPI key (optional)
  GNEWS_KEY           GNews API key (optional)
`);
}

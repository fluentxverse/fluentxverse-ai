import neo4j, { Driver } from 'neo4j-driver';

let driver: Driver;
let isInitialized = false;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Initialize the Memgraph driver with connection parameters
 */
export async function initDriver(uri: string, username: string, password: string, retries: number = 5, delay: number = 2000): Promise<Driver> {
  let attempt: number = 0;

  while (attempt < retries) {
    try {
      driver = neo4j.driver(
        uri,
        neo4j.auth.basic(username, password),
        // {
        //   encrypted: 'ENCRYPTION_ON',  // Enable SSL
        //   trust: 'TRUST_ALL_CERTIFICATES',
        // }
      );

      // Try to get server info to verify the connection
      await driver.getServerInfo();

      // If connection is successful, break out of the loop
      console.log('✅ Successfully connected to Memgraph');
      isInitialized = true;
      return driver;
    } catch (error: any) {
      attempt++;
      console.error(`Attempt ${attempt} failed: ${error.message}`);

      if (attempt < retries) {
        console.log(`Retrying in ${delay / 1000} seconds...`);
        await sleep(delay);
      } else {
        throw new Error(`Failed to connect to Memgraph after ${retries} attempts.`);
      }
    }
  }

  // This will never be reached if the retry limit is reached and an error is thrown
  throw new Error('Unable to initialize Memgraph driver.');
}

/**
 * Initialize Memgraph using environment variables
 * MEMGRAPH_URI, MEMGRAPH_USER, MEMGRAPH_PASSWORD
 */
export async function initMemgraph(): Promise<Driver> {
  const uri = process.env.MEMGRAPH_URI || 'bolt://localhost:7687';
  // Support both MEMGRAPH_USER and MEMGRAPH_USERNAME for flexibility
  const username = process.env.MEMGRAPH_USER || process.env.MEMGRAPH_USERNAME || '';
  const password = process.env.MEMGRAPH_PASSWORD || '';
  
  console.log(`📡 Connecting to Memgraph at: ${uri}`);
  console.log(`👤 Username: ${username || '(empty)'}`);
  
  return initDriver(uri, username, password);
}

/**
 * Check if the driver is initialized
 */
export function isDriverInitialized(): boolean {
  return isInitialized;
}

/**
 * Ensure the driver is initialized before use
 */
export async function ensureInitialized(): Promise<Driver> {
  if (!isInitialized) {
    await initMemgraph();
  }
  return driver;
}

/**
 * Get the instance of the Neo4j Driver created in the `initDriver` function
 * @returns {neo4j.Driver}
 */
export function getDriver(): Driver {
  return driver;
}

/**
 * If the driver has been instantiated, close it and all remaining open sessions
 * @returns {Promise<void>}
 */
export async function closeDriver(): Promise<void> {
  if (driver) {
    await driver.close();
  }
}


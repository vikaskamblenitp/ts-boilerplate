import { envConfig } from "#configs";
import { Pool } from "pg";
import { logger } from "./logger";

const poolConfig = {
  host: envConfig.DB_HOST,
  port: parseInt(envConfig.DB_PORT || "") || 5432,
  user: envConfig.DB_USER,
  password: envConfig.DB_PASSWORD,
  database: envConfig.DB_NAME,
  max: parseInt(envConfig.DB_MAX_CONNECTIONS || "") || 100,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 0,
  ssl: envConfig.ENV === "production" ? { rejectUnauthorized: false } : false,
};

class DatabaseError extends Error {
  constructor(message) {
    super(message);
    this.name = "DatabaseError";
  }
}

class Database {
  private pool: Pool;
  private static database: Database;

  private constructor() {
    this.pool = new Pool(poolConfig);
  }

  static getInstance() {
    if (!this.database) {
      this.database = new Database();
    }
    return this.database;
  }

  async init() {
    await new Promise((resolve, reject) => {
      // try to connect
      this.pool.connect((err, client, done) => {
        if (err) {
          return reject(
            new DatabaseError(`Error connecting to database: ${err.message}`)
          );
        }
        logger.info("Successfully connected to database !!");
        return resolve(done());
      });
    });
  }

  async query<T>(query: {
    sql: string;
    values?: Array<string | number | boolean | Record<string, any>>;
  }) {
    const client = await this.pool.connect();
    try {
      const { sql, values } = query;
      logger.debug(`sql: ${sql} | data: ${values}`);
      const result = await client.query(sql, values);
      return result.rows as T[];
    } catch (error) {
      logger.error(error);
      throw new DatabaseError((error as Error).message);
    } finally {
      client.release();
    }
  }

  async transaction(
    queries: { sql: string; values?: Array<string | number | boolean | Record<string, any>> }[]
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const results: any[] = [];
      for (const { sql, values } of queries) {
        const result = await client.query(sql, values);
        results.push(result);
      }
      await client.query("COMMIT");
      return results;
    } catch (error) {
      logger.error(error);
      await client.query("ROLLBACK");
      throw new DatabaseError((error as Error).message);
    } finally {
      client.release();
    }
  }
}

export const db = Database.getInstance();

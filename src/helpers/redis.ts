import { envConfig } from "#configs";
import Redis, { type ScanStream, type Redis as IRedis, type Cluster, type RedisKey, type RedisValue, type ClusterNode, ClusterOptions } from "ioredis";
import { ILogger } from "./logger";
// import { Logger } from "pino";
const REDIS_READY_STATUS = "ready";

let client: Redis | Cluster;
const TTL = "300";

interface RedisConfig {
	ecClusterMode: boolean;
	conn: {
		url: string;
		host: string;
		port: string;
		password: string;
		disableTLS: boolean;
		rejectUnauthorized: boolean;
	};
	reconnectMaxWait: number;
}

// Connection parameters for the Redis instance which handles caching.
export const redisConfig: RedisConfig = {
	// Connect to Elasticache using ioRedis cluster mode. Use this if EC is responding with
	// "MOVED" errors.
	ecClusterMode: envConfig.REDIS_EC_CLUSTER,
	// Cache Redis connection credentials
	conn: {
		url: envConfig.REDIS_URL ?? "",
		host: envConfig.REDIS_HOST ?? "",
		port: envConfig.REDIS_PORT ?? "",
		password: envConfig.REDIS_PASSWORD ?? "",
		disableTLS: envConfig.REDIS_DISABLE_TLS,
		rejectUnauthorized: !envConfig.REDIS_DISABLE_TLS_REJECT_UNAUTHORIZED
	},
	// Max milliseconds to wait between reconnection attempts
	reconnectMaxWait: envConfig.REDIS_RECONNECT_MAX_WAIT || 2000
};

const getReconnectMaxWait = (config: RedisConfig): number => config.reconnectMaxWait || 2000;

const createClient = (config: RedisConfig, logger: ILogger) => {
	const { conn } = config;
	const reconnectMaxWait = getReconnectMaxWait(config);
	const options: Record<string, any> = {
		retryStrategy(times: number) {
			logger.warn("Lost Redis connection, reattempting");
			return Math.min(times * 2, reconnectMaxWait);
		},
		// eslint-disable-next-line consistent-return
		reconnectOnError(err: any) {
			logger.error(err);
			const targetError = "READONLY";
			if (err.message.slice(0, targetError.length) === "READONLY") {
				// When a slave is promoted, we might get temporary errors saying
				// READONLY You can't write against a read only slave. Attempt to
				// reconnect if this happens.
				logger.warn("ElastiCache returned a READONLY error, reconnecting");
				return 2; // `1` means reconnect, `2` means reconnect and resend
				// the failed command
			}
		}
	};

	if (conn.url) {
		return new Redis(conn.url, options);
	}

	if (conn.password) {
		options.password = conn.password;
	}

	if (conn.disableTLS === true) {
		logger.warn("Connecting to Redis insecurely");
	} else {
		options.tls = {};
		const { rejectUnauthorized: ru } = conn;
		if (typeof ru === "boolean") {
			if (!ru) {
				logger.warn("Skipping Redis CA validation. Consider changing to a hostname that matches the certificate's names instead of disabling rejectUnauthorized.");
			}
			options.tls.rejectUnauthorized = ru;
		}
	}

	if (config.ecClusterMode) {
		return new Redis.Cluster([`//${conn.host}:${conn.port}`], {
			scaleReads: "slave",
			redisOptions: {
				...options
			}
		});
	}
	return new Redis(parseInt(conn.port), conn.host, options);
};

export const redisConnect = (config: RedisConfig, logger: ILogger) => {
	client = createClient(config, logger);
	client.on("connect", () =>
		logger.info("Connecting to Redis...", {
			clusterMode: config.ecClusterMode ? "YES" : "NO",
			method: config.conn.url ? "URL connection string" : "host + port",
			password: config.conn.password ? "YES" : "NO",
			reconnectMaxWait: getReconnectMaxWait(config)
		})
	);
	client.on("ready", () => logger.info("Redis is ready"));
	client.on("error", err => logger.error(err));
	client.on("close", () => logger.warn("Redis connection closed"));
	client.on("reconnecting", (ms: number) => logger.info(`Reconnecting to Redis in ${ms}ms`));
	client.on("end", () => logger.warn("Redis connection ended"));
	return client;
};

export const isHealthy = () => {
	if (client.status === REDIS_READY_STATUS) {
		return client.ping();
	}
	return Promise.reject(Error(`Bad Redis status: ${client.status}`));
};

export const quitGracefully = () => {
	if (typeof client.quit === "function") {
		// Instance is a cluster connection that can be gracefully quit
		return client.quit();
	}
	if (typeof client.disconnect === "function") {
		// Instance is a non-clustered client
		client.disconnect();
		return Promise.resolve();
	}
	return Promise.reject(new Error("Cannot disconnect invalid Redis client instance"));
};

export const redis = {
	get: async (key: RedisKey): Promise<RedisValue | null> => {
		const result = await client.get(key);
		try {
			return JSON.parse(result ?? "");
		} catch {
			return result;
		}
	},
	set: async (key: string, value: string | object): Promise<boolean> => {
		if (typeof value === "object") {
			await client.set(key, JSON.stringify(value));
		} else {
			await client.set(key, value);
		}
		return true;
	},
	setex: async (key: string, value: string | Object, ttl: number = 60,): Promise<boolean> => {
		if (typeof value === "object") {
      await client.setex(key, ttl, JSON.stringify(value));
    } else {
      await client.setex(key, ttl, value);
    }
    return true;
	},
	hget: async (key: string, field: string): Promise<string | null> => {
		const result = await client.hget(key, field);
		try {
			return JSON.parse(result ?? "");
		} catch {
			return result;
		}
	},
	hmget: async (key: string, fields: (string | Buffer)[]): Promise<(string | null)[] | object[]> => {
		const result = await client.hmget(key, ...fields);
		try {
			return result.map(val => (val ? JSON.parse(val) : null));
		} catch {
			return result;
		}
	},
	hset: async (key: string, field: string, value: string | object): Promise<boolean> => {
		if (typeof value === "object") {
			await client.hset(key, field, JSON.stringify(value));
		} else if (!value && Array.isArray(field)) {
			// field is an array of key-value pairs [ key, JSON.stringify(value), key, JSON.stringify(value), ...]
			await client.hset(key, ...field);
		} else {
			await client.hset(key, field, value);
		}
		return true;
	},

	hgetall: async (rediskey: RedisKey): Promise<Record<string, string | object>> => {
		let result = await client.hgetall(rediskey);
		result = Object.keys(result).reduce((acc, key) => {
			if (typeof result[key] === "string") {
				try {
					acc[key] = JSON.parse(result[key]);
				} catch {
					acc[key] = result[key];
				}
			} else {
				acc[key] = result[key];
			}
			return acc;
		}, {});

		return result;
	},

	exists: async (key: RedisKey): Promise<boolean> => {
		const result = await client.exists(key);
		return Boolean(result);
	},

	expire: async (key: RedisKey, EX: string = TTL): Promise<boolean> => {
		await client.expire(key, EX);
		return true;
	},

	delete: async (key: RedisKey): Promise<boolean> => {
		await client.del(key);
		return true;
	},

	// data is an array of key-value pairs [ key, JSON.stringify(value), key, JSON.stringify(value), ...]
	mset: async (data: [string, string][]) => {
		try {
			if (!Array.isArray(data)) {
				throw new Error("Data must be an array");
			}
			if (!data.length) {
				return;
			}
			const convertedData: (number | RedisKey)[] = data.flat();
			await client.mset(...convertedData);
		} catch (error) {
			throw error;
		}
	},

	mget: async (keys: string[]): Promise<(string | null)[]> => {
		try {
			if (!Array.isArray(keys)) {
				throw new Error("Keys must be an array");
			}
			const result = await client.mget(...keys);
			return result;
		} catch (error) {
			throw error;
		}
	},

	deleteMultipleKeys: async (keys: string[]) => {
		try {
			if (!keys.length) {
				return;
			}
			const pipeline = client.pipeline();
			keys.forEach(key => {
				pipeline.del(key);
			});
			await pipeline.exec();
		} catch (error) {
			throw error;
		}
	},

	deleteMultiple: (pattern: string, keyCount: number) => {
		return new Promise(resolve => {
			let stream: ScanStream;
			if (redisConfig.ecClusterMode) {
				const newClient = client as Cluster;
				const node = newClient.nodes("master");
				stream = node[0].scanStream({
					match: pattern,
					count: keyCount
				});
			} else {
				const newClient = client as IRedis;
				stream = newClient.scanStream({
					match: pattern,
					count: keyCount
				});
			}
			const pipeline = client.pipeline();
			stream.on("data", keys => {
				keys.forEach((key: RedisKey) => {
					pipeline.del(key); // Remove the square brackets around key
				});
			});
			stream.on("end", async () => {
				await pipeline.exec();
				resolve(true);
			});
		});
	},

	// limit is a key count under which the scan will stop.
	// scan will look for pattern in all keys and return the values of the keys that match the pattern
	getByPattern: (pattern: string, limit = 100000) => {
		try {
			return new Promise(resolve => {
				const pipeline = client.pipeline();
				let stream: ScanStream, values: unknown;
				if (redisConfig.ecClusterMode) {
					const newClient = client as Cluster;
					const node = newClient.nodes("master");
					stream = node[0].scanStream({
						match: pattern,
						count: limit
					});
				} else {
					const newClient = client as IRedis;
					stream = newClient.scanStream({
						match: pattern,
						count: limit
					});
				}
				stream.on("data", keys => {
					keys.forEach((key: RedisKey) => {
						pipeline.get(key);
					});
				});

				stream.on("end", async () => {
					// eslint-disable-next-line require-atomic-updates
					values = await pipeline.exec();
					resolve(values);
				});
			});
		} catch (error) {
			throw error;
		}
	},

	/**
	 * @description adds a value to a redis set or creates a new set if it doesn't exist
	 * @param {*} key key of the redis set
	 * @param {*} value can be a string or an array of strings
	 * @returns {Promise<boolean>} true if the value is added to the set
	 */
	sadd: async (key: string, value: string | string[]): Promise<boolean> => {
		const newValues = typeof value === "string" ? [value] : value;
		await client.sadd(key, newValues);
		return true;
	},

	spop: async (key: string, count: number | string = 1): Promise<string[] | null> => {
		const result = await client.spop(key, count);
		return result;
	},

	sismember: async (key: string, value: string): Promise<boolean> => {
		const result = await client.sismember(key, value);
		return Boolean(result);
	},

	scard: async (key: string): Promise<number> => {
		const result = await client.scard(key);
		return result;
	}
};

/**
 * @description creates a new Redis Cluster client as of now only with a single node
 * @param conn
 * @param opts
 * @returns
 */
export const createClusterClient = (conn: ClusterNode & { TLS: boolean; password: string }, opts: ClusterOptions) => {
	const clusterClient = new Redis.Cluster([conn], {
		...opts,
		dnsLookup: (address, callback) => callback(null, address),
		redisOptions: {
			tls: {
				rejectUnauthorized: conn.TLS
			},
			password: conn.password
		}
	});

	return clusterClient;
};

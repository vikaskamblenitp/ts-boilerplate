import { envConfig } from "#configs/index";
import Queue, { type CronRepeatOptions, type EveryRepeatOptions, type Queue as IQueue, type Job, type JobId, type JobOptions } from "bull";
import { type ClusterNode } from "ioredis";
import { createClusterClient, redisConfig } from "./redis";
import { logger } from "./logger";

type BullQueueJobStatus = {
	provided: Job["data"];
	message: any;
};
export type BullQueueRequest = {
	jobIds: Array<JobId>;
	processed: number;
	ok: Record<JobId, BullQueueJobStatus> | {};
	error: Record<JobId, BullQueueJobStatus> | {};
};

const clusterNode: ClusterNode & { TLS: boolean; password: string } = {
	// url: envConfig.REDIS_URL,
	host: envConfig.REDIS_HOST,
	port: Number(envConfig.REDIS_PORT) || 6379,
	// username: envConfig.REDIS_USERNAME,
	password: envConfig.REDIS_PASSWORD ?? "",
	TLS: !envConfig.REDIS_DISABLE_TLS
	// rejectUnauthorized: envConfig.REDIS_DISABLE_TLS_REJECT_UNAUTHORIZED
};

const clusterOptions = {
	enableReadyCheck: false,
	slotsRefreshTimeout: 2000
};

/* When Redis is running locally, pass in ioredis options, otherwise the createClient function is used to create a new cluster client for each job  */
const generateQueueOptions = (): Partial<Queue.QueueOptions> => {
	const config = {
		prefix: "{bull}"
	} as Partial<Queue.QueueOptions>;

	if (["localhost", "127.0.0.1"].includes(envConfig.REDIS_HOST ?? "")) {
		config.redis = redisConfig as any;
	} else {
		config.createClient = () => {
			const client = createClusterClient(clusterNode, clusterOptions);
			return client;
		};
	}
	return config;
};

class BullQueue {
	queue: IQueue;

	constructor(queueName: string) {
		this.queue = new Queue(queueName, generateQueueOptions());
		this.queue.on("error", error => {
			logger.error(`queue=${queueName} | Error: ${error}`);
		});
	}

	async getJobByID(jobID: string): Promise<Job | null> {
		const job = await this.queue.getJob(jobID);

		return job;
	}

	async removeJobByID(jobID: string) {
		const job = await this.getJobByID(jobID);

		if (job) {
			await job.remove();
		}
	}

	async addJob(event: string, data: Record<string, any> | string | number, opts: JobOptions = { removeOnComplete: true, removeOnFail: true }) {
		try {
			const job = await this.queue.add(event, data, opts);
			return job;
		} catch (error) {
			throw error;
		}
	}

	addMultipleJobs(jobs: Job[]) {
		return this.queue.addBulk(jobs);
	}

	async reprocessFailedJobs(job: Job) {
		await this.queue.add(job.name, job.data, { delay: job.opts.delay });
	}

	async removeRepeatable(
		name: string,
		repeat: (CronRepeatOptions | EveryRepeatOptions) & {
			jobId?: JobId | undefined;
		}
	) {
		await this.queue.removeRepeatable(name, repeat);
	}

	async removeRepeatableByKey(key: string) {
		await this.queue.removeRepeatableByKey(key);
		logger.info(`Removed repeatable job with key: ${key}`);
	}

	async pause() {
		await this.queue.pause();
		logger.info(`Paused queue: ${this.queue.name}`);
	}

	async resume() {
		await this.queue.resume();
		logger.info(`Resumed queue: ${this.queue.name}`);
	}

	/**
	 * @description Pauses the queue for a specified amount of time and then resumes it
	 * @param delay in miliseconds
	 */
	async pauseQueue(delay: number) {
		logger.info(`BULL QUEUE: ********PAUSING QUEUE********`);
		await this.queue.pause(true, false);
		logger.info(`BULL QUEUE: ********QUEUE PAUSED********`);

		// Wait for the specified amount of time
		setTimeout(async () => {
			console.log("Resuming the queue...");
			await this.queue.resume(); // Resume the queue
			console.log("Queue resumed");
		}, delay * 1000);
	}
}

export default BullQueue;

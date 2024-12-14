import { Kafka, KafkaJSError, Consumer as ConsumerType, type ConsumerConfig, type KafkaConfig, type ProducerConfig } from "kafkajs";
import { consumerConfig, kafkaConfig, producerConfig } from "#configs/index";
import { logger } from "./logger";

const kafkaClient = new Kafka(kafkaConfig as unknown as KafkaConfig);

class Consumer {
	consumer: ConsumerType;
	constructor() {
		this.consumer = kafkaClient.consumer(consumerConfig as ConsumerConfig);
	}
	async init() {
		try {
			const { COMMIT_OFFSETS } = this.consumer.events;
			await this.consumer.connect();
			this.consumer.on(COMMIT_OFFSETS, event => {
				logger.debug(`Kafka Consumer committed offsets: ${JSON.stringify(event)}`);
			});
		} catch (error) {
			throw error;
		}
	}
	async run(topics, handler) {
		try {
			await this.consumer.subscribe({ topics, fromBeginning: true });
			await this.consumer.run({ autoCommit: true, autoCommitInterval: 5000, autoCommitThreshold: 5, eachMessage: handler });
		} catch (error) {
			throw error;
		}
	}
	/* REFERENCE: handler = async ({ topic, partition, message }) => {} */

	async commitOffsets(offsets) {
		try {
			await this.consumer.commitOffsets(offsets);
		} catch (error) {
			throw error;
		}
	}
}

class Producer {
	producer;
	constructor() {
		this.producer = kafkaClient.producer(producerConfig as ProducerConfig);
	}
	async init() {
		try {
			await this.producer.connect();
		} catch (error) {
			throw error;
		}
	}
	/**
	 *
	 * @param {String} topic
	 * @param {Array} messages: Array of key(string/Buffer) value(string/Buffer) pairs
	 * @returns {Promise<void>}
	 */
	async send({ topic, messages }: { topic: string; messages: Array<{ key: string | Buffer; value: string | Buffer }> }) {
		try {
			await this.producer.send({ topic, messages });
		} catch (error: unknown) {
			if (error instanceof KafkaJSError && (error as Error).message === "The producer is disconnected") {
				await this.init();
				await this.producer.send({ topic, messages });
				return;
			}
			throw error;
		}
	}
}
export const consumer = new Consumer();
export const producer = new Producer();

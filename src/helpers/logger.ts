import pino, { Logger as TLogger } from "pino";
import pretty from "pino-pretty";
import pinoHttp, { HttpLogger } from "pino-http";

const level = "info";

export interface ILogger {
	info(...messages: (string | null | undefined | Object)[]): void;
	debug(message: string): void;
	error(message: string): void;
	warn(message: string): void;
}

class Logger implements ILogger {
	private static logger: Logger;
	private pinoLogger: TLogger<never, boolean>;
	private pinoHttpLogger: HttpLogger;

	private constructor() {
		const createStream = () => {
			return pretty({
				colorize: true,
				levelFirst: true, // --levelFirst: display the log level name before the logged date and time
				ignore: "hostname,pid,module",
				translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l"
			});
		};

		this.pinoLogger = pino(
			{
				name: "server",
				level,
				formatters: {
					level(label) {
						return { level: label };
					}
				}
			},
			createStream()
		);
		this.pinoHttpLogger = pinoHttp({
			logger: pino(
				{
					name: "express",
					formatters: {
						level(label) {
							return { level: label };
						}
					}
				},
				createStream()
			),
			customLogLevel: (req, res, err) => {
				if (res.statusCode >= 400 && res.statusCode < 500) {
					return "warn";
				} else if (res.statusCode >= 500 || err) {
					return "error";
				}
				return "silent";
			},
			serializers: {
				res: res => ({
					status: res.statusCode
				}),
				req: req => ({
					method: req.method,
					url: req.url
				})
			},
			redact: {
				paths: ["req.headers.authorization", "req.headers.cookie"],
				censor: "*** (masked value)"
			}
		});
	}

	public static getLogger() {
		return new Logger();
	}

	public info(...messages: (string | null | undefined | Object)[]) {
			if(messages.length === 1) {
				this.pinoLogger.info(messages[0]); 
			} else {
				this.pinoLogger.info(JSON.stringify(messages));
			}
	}

	public error(message: string | unknown) {
		this.pinoLogger.error(message)
	}

	public debug(message: string) {
		this.pinoLogger.debug(message);
	}

	public warn(message: string) {
		this.pinoLogger.warn(message);
	}

	public getPinoHttpLogger() {
		return this.pinoHttpLogger;
	}

}

export const logger = Logger.getLogger();

export const pinoHttpLogger = logger.getPinoHttpLogger();

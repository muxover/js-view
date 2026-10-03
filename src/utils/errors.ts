export class HttpError extends Error {
	readonly statusCode: number;
	readonly details?: unknown;

	constructor(statusCode: number, message: string, details?: unknown) {
		super(message);
		this.name = "HttpError";
		this.statusCode = statusCode;
		this.details = details;
	}
}

export class TimeoutError extends HttpError {
	constructor(message = "Render timed out") {
		super(504, message);
		this.name = "TimeoutError";
	}
}

/** Run a promise with a hard timeout, rejecting with a TimeoutError. */
export function withTimeout<T>(
	promise: Promise<T>,
	ms: number,
	message?: string,
): Promise<T> {
	let timer: NodeJS.Timeout;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() =>
				reject(
					new TimeoutError(message ?? `Operation timed out after ${ms}ms`),
				),
			ms,
		);
	});
	return Promise.race([promise, timeout]).finally(() =>
		clearTimeout(timer),
	) as Promise<T>;
}

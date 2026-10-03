import express from "express";
import type { Express } from "express";
import { pinoHttp } from "pino-http";
import { router } from "./routes.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { touch } from "./activity.js";
import { logger } from "../utils/logger.js";

export function createApp(): Express {
	const app = express();

	app.use((_req, _res, next) => {
		touch();
		next();
	});
	app.use(pinoHttp({ logger }));
	app.use(express.json({ limit: "1mb" }));

	app.use(router);

	app.use(notFound);
	app.use(errorHandler);

	return app;
}

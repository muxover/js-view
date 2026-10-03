import pino from "pino";
import { config } from "../config.js";

// stdout carries results (CLI output, MCP messages), so logs go to stderr.
export const logger = pino(
	{
		level: config.logLevel,
		base: { service: "js-view" },
		timestamp: pino.stdTimeFunctions.isoTime,
	},
	pino.destination(2),
);

export type Logger = typeof logger;

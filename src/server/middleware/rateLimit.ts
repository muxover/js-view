import rateLimit from "express-rate-limit";
import { config } from "../../config.js";

export const renderRateLimiter = rateLimit({
	windowMs: config.rateLimit.windowMs,
	max: config.rateLimit.max,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: "Too many requests, please slow down." },
});

import { startService } from "./service.js";
import { logger } from "./utils/logger.js";

startService().catch((err) => {
	logger.error({ err }, "Fatal startup error");
	process.exit(1);
});

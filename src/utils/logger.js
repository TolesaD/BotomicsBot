// src/utils/logger.js - Simple logger utility
const winston = require("winston");
const path = require("path");
const fs = require("fs");

// Ensure logs directory exists
const logDir = path.join(__dirname, "../../logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Configure Winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({
      format: "YYYY-MM-DD HH:mm:ss",
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json(),
  ),
  defaultMeta: { service: "botomics-platform" },
  transports: [
    // Write all logs with level 'error' and below to error.log
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
    }),
    // Write all logs to combined.log
    new winston.transports.File({
      filename: path.join(logDir, "combined.log"),
    }),
    // Write test logs to test.log
    new winston.transports.File({
      filename: path.join(logDir, "test.log"),
      level: process.env.NODE_ENV === "test" ? "debug" : "info",
    }),
  ],
});

// If we're not in production, also log to the console
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
      ),
    }),
  );
}

// Create a stream object for Morgan integration
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  },
};

// Export convenience methods
module.exports = {
  logger,
  info: (...args) => logger.info(...args),
  error: (...args) => logger.error(...args),
  warn: (...args) => logger.warn(...args),
  debug: (...args) => logger.debug(...args),
  verbose: (...args) => logger.verbose(...args),

  // Simple console fallback if logger fails
  log: (level, message, ...meta) => {
    try {
      logger.log(level, message, ...meta);
    } catch (error) {
      console.log(`[${level}] ${message}`, ...meta);
    }
  },
};

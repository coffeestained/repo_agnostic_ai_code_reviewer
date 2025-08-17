import winston from "winston";
import "winston-daily-rotate-file";
import path from "path";
import fs from "fs";

const logDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const transports = [
    new winston.transports.Console({
        format: winston.format.combine(winston.format.colorize(), winston.format.simple())
    })
];

const levels = ["info", "debug", "error"];

if (process.env.LOG_ROTATION === "true") {
    levels.forEach(level => {
        transports.push(
            new winston.transports.DailyRotateFile({
                level,
                dirname: logDir,
                filename: `${level.toUpperCase()}-%DATE%.log`,
                datePattern: "YYYY-MM-DD",
                zippedArchive: true,
                maxSize: "20m",
                maxFiles: "14d"
            })
        );
    });
} else {
    levels.forEach(level => {
        transports.push(
            new winston.transports.File({
                level,
                dirname: logDir,
                filename: `${level.toUpperCase()}.log`,
                maxsize: 5 * 1024 * 1024,
                maxFiles: 1
            })
        );
    });
}

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || "info",
    format: winston.format.combine(
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.printf(info => `[${info.timestamp}] [${info.level}] ${info.message}`)
    ),
    transports
});

class LoggerClass {
    info = (...args) => logger.info(args.join(" "));
    debug = (...args) => logger.debug(args.join(" "));
    error = (...args) => logger.error(args.join(" "));
}

export const Logger = new LoggerClass();

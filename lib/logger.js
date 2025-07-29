/**
 * Likely will introduce log rotation and log levels when requirements call for it. (soon)
 */
class LoggerClass {
    constructor() {
        this.info = console.log;
        this.debug = console.log;
        this.error = console.log;
    }
}
export const Logger = new LoggerClass();
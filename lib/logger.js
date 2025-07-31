const enabled = {
    info: true,
    debug: ['debug'].includes(process.env.LOG_LEVEL),
    error: ['debug', 'error'].includes(process.env.LOG_LEVEL)
}

/**
 * Likely will introduce log rotation and log levels when requirements call for it. (soon)
 */
class LoggerClass {
    constructor() {
        this.info = enabled.info ? console.log : () => null;
        this.debug = enabled.debug ? console.log : () => null;
        this.error = enabled.error ? console.log : () => null;
    }
}
export const Logger = new LoggerClass();
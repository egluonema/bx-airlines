/**
 * Logger utility class that takes in debugMode arg (from BXI_DEBUG_LOGGING in .env)
 * This is used in server.js and on front end.
 */
class Logger {
  constructor(debugMode) {
    this.debugMode = debugMode;
  }

  log(...args) {
    if (this.debugMode) {
      console.log(...args);
    }
  }

  error(...args) {
    console.error(...args);
  }

  warn(...args) {
    console.warn(...args);
  }
}

export default Logger;
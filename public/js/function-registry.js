function initFunctionRegistry(logger) {
  // Initialize function registry
  window.bxi = {
    ...window.bxi,
    functionRegistry: {},
    // Safe call registry function, console.warn if a function is not present
    callFunction: async (name, params) => {
      const fn = bxi.functionRegistry[name];
      if (fn) {
        logger.log(`Function '${name}' found in function registry, it is being called with params`, params);
        return await fn(params);
      } else {
        logger.warn(`No function '${name}' was found in the bxi function registry, ensure you have registered it`);
      }
    },
    // Register a function with logger.warn if it is done incorrectly, 
    // functions can be registered as a named function or  a string with an anonymous function
    registerFunction: (arg1, arg2) => {
      if (typeof arg1 === 'string') {
        if (typeof arg2 !== 'function') {
          logger.warn('When registering a bxi function, if the first argument is a string, second argument must be a function');
        }

        logger.log(`Adding function ${arg1} to function registry`);
        window.bxi.functionRegistry[arg1] = arg2;
      } else if (typeof arg1 === 'function') {
        if (arg1.name) {
          logger.log(`Adding function '${arg1.name}' to function registry`);
          window.bxi.functionRegistry[arg1.name] = arg1;
        } else {
          logger.warn('Anonymous functions may not be registered in bxi unless the first parameter provides a name')
        }
      } else {
        logger.warn(`Invalid argument type in registerFunction, expected 'string' or 'function'`);
      }
    },
    // Helper function to get a property from an object without caring about case
    getParameterCaseInsensitive: (obj, key) => {
      if (!obj) {
        return null;
      }
  
      const foundKey = Object.keys(obj).find(k =>  k.toLowerCase() === key.toLowerCase());
      logger.log(`Checking for case insensitive parameter key: ${key}, foundKey: ${foundKey}`, obj);
      return foundKey ? obj[foundKey] : null;
    }
  }
}

export default initFunctionRegistry;
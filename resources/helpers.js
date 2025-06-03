import fs from 'fs';
import crypto from 'crypto';

let verticals;
let verticalsEndpointMaps = {};

/**
 * Returns an object with all whitelisted (within this function) environment variables that can be used
 * in handlebars template {{env.<variable-name}} or front-end window._env_['<variable-name>']
 *
 * @returns Object with environment variables in { [key]: value }
 */
function getBxiEnvironmentVariables() {
  const bxiEnvVars = {};

  // These will be available in the front end on window._env_[<variable-name>]
  const whitelist = [
    // 'BXI_API_URL', // Uncomment if needed
    // 'BXI_API_KEY', // Uncomment if needed (not recommended for security reasons)
    // 'BXI_COMPANY_ID', // Uncomment if needed (not recommended for security reasons)
    'BXI_DV_JS_URL',
    'BXI_LOGIN_POLICY_ID',
    'BXI_REGISTRATION_POLICY_ID',
    'BXI_PASSWORD_RESET_POLICY_ID',
    'BXI_DEVICE_MANAGEMENT_POLICY_ID',
    'BXI_DASHBOARD_POLICY_ID',
    'BXI_GENERIC_POLICY_ID',
    'BXI_REMIX_POLICY_ID',
    'BXI_PROFILE_MANAGEMENT_POLICY_ID',
    'BXI_SHOW_REMIX_BUTTON',
    'BXI_GLITCH_REMIX_PROJECT',
    'BXI_DEBUG_LOGGING',
    'BXI_USE_REDIRECT',
    'BXI_REDIRECT_ISSUER',
    'BXI_REDIRECT_CLIENT_ID',
  ];

  Object.keys(process.env).forEach((env) => {
    if (whitelist.includes(env)) {
      bxiEnvVars[env] = process.env[env];
    }
  });

  if (bxiEnvVars['BXI_SHOW_REMIX_BUTTON'] !== 'true') {
    // Handlebars apparently doesn't process booleans in if helpers,
    // if we delete the variable the remix button will not be displayed.
    delete bxiEnvVars['BXI_SHOW_REMIX_BUTTON'];
  }

  if (bxiEnvVars['BXI_USE_REDIRECT'] !== 'true') {
    // Handlebars apparently doesn't process booleans in if helpers,
    // if we delete the variable the remix button will not be displayed.
    delete bxiEnvVars['BXI_USE_REDIRECT'];
  }

  return bxiEnvVars;
}

/**
 * Returns a list of all verticals build based on directories in src/pages, this is cached
 * if adding a new vertical server.js needs to be restarted, this should be uncommon
 *
 * @returns List of all verticals
 */
function getVerticals() {
  if (verticals) {
    return verticals;
  }

  verticals = fs
    .readdirSync('src/pages', { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  return verticals;
}

function isValidVertical(vertical) {
  return getVerticals().includes(vertical);
}

/**
 * Introspects the vertical's view directory to set up endpoints for all available hbs files (except branding.hbs)
 *
 * @param {string} vertical Vertical name
 * @returns {Object} A map like {<file-location-in-project>: <server-endpoint>}
 */
function getVerticalEndpoints(vertical) {
  // Traversing filesystem is expensive, cache results
  // also this prevents map from getting out of sync if a user adds a file but doesn't restart server
  const cachedEndpointMap = verticalsEndpointMaps[vertical];
  if (cachedEndpointMap) {
    return cachedEndpointMap;
  }

  const verticalViewRoot = `src/pages/${vertical}`;
  const allFiles = fs.readdirSync(verticalViewRoot);

  // Filter out non-handlebars files (e.g. settings.json) and branding files
  const endpointFiles = allFiles.filter(
    (file) => file.match(/.*\.(hbs?)/gi) && file !== 'branding.hbs'
  );

  const endpointMap = {};
  endpointFiles.forEach((file) => {
    endpointMap[`${verticalViewRoot}/${file}`] = stripTrailingSlash(
      // remove trailing slash from 'index' endpoint
      `/${vertical}/${
        file
          .replace('.hbs', '') // remove extension
          .replace('index', '') // replace index with empty string since that's the root url
      }`
    );
  });

  verticalsEndpointMaps[vertical] = endpointMap;

  return endpointMap;
}

function getVerticalLinks(vertical) {
  const endpoints = Object.values(getVerticalEndpoints(vertical));
  const linkMap = {};

  endpoints.forEach((endpoint) => {
    const name = endpoint.replace(`/${vertical}`, '');
    const determinedName = name === '' ? 'home' : stripLeadingSlash(name);
    linkMap[determinedName.charAt(0).toUpperCase() + determinedName.slice(1)] =
      endpoint;
  });

  // Property order matters for shortcuts page, home then dashboard, then whatever custom pages
  // Any null endpoints will be removed from the link map before it's returned
  const orderedLinkMap = {
    Home: null,
    Dashboard: null,
  };

  Object.assign(orderedLinkMap, linkMap);

  // Dialog examples should always be last link, will be removed from the map in case of generic vertical
  orderedLinkMap['Dialog Examples'] =
    vertical !== 'generic' ? `/${vertical}/dialog-examples` : null;

  // Remove any keys which are null, e.g. dialog examples and dashboard from generic or any deleted Home/Dashboard pages
  return Object.fromEntries(
    Object.entries(orderedLinkMap).filter(([_, v]) => v != null)
  );
}

function stripTrailingSlash(str) {
  return str.endsWith('/') ? str.slice(0, -1) : str;
}

function stripLeadingSlash(str) {
  return str.startsWith('/') ? str.slice(1) : str;
}

/**
 * Returns a file at the provided location, but calculates the file's sha1 and adds it as url
 * parameter to bust caching, used so if user makes changes to the file the new file will picked up
 * without restarting server
 *
 * @param {string} fileLocation
 * @returns {Promise} - file that has been imported
 */
function importWithCacheBusting(fileLocation) {
  const fileBuffer = fs.readFileSync(fileLocation);
  const fileHash = crypto.createHash('sha1');
  fileHash.update(fileBuffer);

  return import(`${fileLocation}?sha1=${fileHash.digest('base64')}`);
}

/**
 * Get a vertical's settings.json file, if we can ever use import for this, make sure to use
 * cache busting above or user's changes won't be picked up without restarting the server
 *
 * @param {string} vertical
 * @returns
 */
function getSettingsFile(vertical) {
  const settingsFile = `./src/pages/${vertical}/settings.json`;
  const date = new Date();

  // These key/value pairs are used to find and replace keys in the settings.json files,
  // e.g. '{{currentYear}}' will be replaced with 2023 (or current year)
  // can add additional replace keys here if needed
  const replaceKeys = {
    currentYear: date.getFullYear(),
    lastYear: date.getFullYear() - 1,
  };

  // Generic vertical doesn't have a settings file (or an admin page, so don't care about username)
  if (fs.existsSync(settingsFile)) {
    let fileStr = fs.readFileSync(settingsFile, 'utf8');
    Object.keys(replaceKeys).forEach((key) => {
      fileStr = fileStr.replaceAll(`{{${key}}}`, replaceKeys[key]);
    });
    return JSON.parse(fileStr);
  }

  return {};
}

/**
 * Get a vertical's editor-mapping.json file, if we can ever use import for this, make sure to use
 * cache busting above or user's changes won't be picked up without restarting the server
 *
 * @param {string} vertical
 * @returns
 */
function getEditorMappingFile(vertical) {
  const settingsFile = `./src/pages/${vertical}/editor-mapping.json`;

  // Generic vertical doesn't have a settings file (or an admin page, so don't care about username)
  if (fs.existsSync(settingsFile)) {
    let fileStr = fs.readFileSync(settingsFile, 'utf8');
    return JSON.parse(fileStr);
  }

  return {};
}

export default {
  getBxiEnvironmentVariables,
  getVerticals,
  isValidVertical,
  importWithCacheBusting,
  getSettingsFile,
  getVerticalEndpoints,
  stripTrailingSlash,
  getVerticalLinks,
  getEditorMappingFile,
};

/**
 * This is the main Node.js server script for your project
 * Check out the two endpoints this back-end API provides in fastify.get and fastify.post below
 */

// Bring in .env file (happens automatically in glitch but not when running locally)
import 'dotenv/config';

// NodeJS imports
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

// External libraries
import Fastify from 'fastify';
import fetch from 'node-fetch';

// Internal js files
import helpers from './resources/helpers.js';
import { initHandlebars } from './resources/handlebars.js';
import Logger from './public/js/logger.js';
import { initDev } from './resources/init-dev.js';

// Initialize variables that are no longer available by default in Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize internal variables
const port = process.env.PORT || 8080;
const bxiEnvVars = helpers.getBxiEnvironmentVariables();
const verticals = helpers.getVerticals();

const debug = process.env.BXI_DEBUG_LOGGING === 'true';
const enableEditing = process.env.BXI_ENABLE_EDITING === 'true';

const logger = new Logger(debug);

let https;

if (process.argv.includes('--dev')) {
  https = initDev(port);
}

// Require the fastify framework and instantiate it
const fastify = Fastify({
  // Set this to true for detailed logging
  logger: debug,
  ignoreTrailingSlash: true,
  https,
});

// Setup our static files (images and SCSS)
fastify.register(import('@fastify/static'), {
  root: path.join(__dirname, 'public'),
  prefix: '/',
});

fastify.register(import('@fastify/cookie'));

initHandlebars(fastify);

// Redirect http traffic to https, glitch doesn't handle this OOTB
fastify.addHook('onRequest', (request, reply, done) => {
  // Don't do this when running locally or if already on https
  const protoHeader = request.headers['x-forwarded-proto'];
  if (
    request.hostname.includes(`:${port}`) ||
    !protoHeader ||
    protoHeader.match(/https/g)
  ) {
    done();
  } else {
    reply.redirect(302, `https://${request.hostname}${request.url}`);
  }
});

// Our home page route
// Redirects to the default vertical (if set in environment variables) or falls back on generic
fastify.get('/', function (request, reply) {
  if (request.hostname.includes('bxgeneric.org')) {
    logger.log('Arrived from bxgeneric domain, redirecting generic vertical');
    reply.redirect('/generic');
    return;
  }

  // Handles redirect back from P1 if using OIDC Redirect
  const redirectOverrideCookie = request.cookies['redirectToVertical'];
  if (redirectOverrideCookie) {
    reply.clearCookie('redirectToVertical');
    reply.redirect(`/${redirectOverrideCookie}`);
    return;
  }

  const defaultVertical = process.env.BXI_ACTIVE_VERTICAL;
  const redirectVertical = helpers.isValidVertical(defaultVertical)
    ? defaultVertical
    : 'company';

  logger.log(
    `Root hit, defined default vertical is: '${defaultVertical}' redirecting to: '${redirectVertical}'`
  );
  reply.redirect(`/${redirectVertical}`);
});

fastify.get('/.well-known/security.txt', function (_, reply) {
  logger.log(
    `/.well-known/securtiy.txt was hit, redirecting ping identity's version`
  );
  reply.redirect(`http://www.pingidentity.com/.well-known/security.txt`);
});

fastify.get('/redirect', function (_, reply) {
  reply.redirect('https://bxgeneric-oidc.glitch.me/');
});

// Get a dv token from the server, we do this in server.js as a security best practice so
// API Keys don't need to be exposed on the front-end
fastify.post('/dvtoken', async function (request, reply) {
  // Allow for apiKey and companyId overrides to come from front end, even though it's not encouraged
  const apiKey = request?.body.apiKey || process.env.BXI_API_KEY;
  const companyId = request?.body.companyId || process.env.BXI_COMPANY_ID;

  let body = {
    policyId: request.body.policyId,
  };

  if (request.cookies['DV-ST']) {
    body.global = {
      sessionToken: request.cookies['DV-ST'],
    };
  }

  if (request.body.flowParameters) {
    body.parameters = request.body.flowParameters;
  }

  const dvBaseUrl = `${process.env.BXI_API_URL}/`;
  const dvSdkTokenBaseUrl = `${process.env.BXI_SDK_TOKEN_URL}/v1`;

  let tokenRequest = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-SK-API-KEY': apiKey,
    },
    body: JSON.stringify(body),
  };

  const tokenResponse = await fetch(
    `${dvSdkTokenBaseUrl}/company/${companyId}/sdktoken`,
    tokenRequest
  ); // Endpoint is case sensitive in Davinci V2
  const parsedResponse = await tokenResponse.json();

  if (!parsedResponse.success) {
    logger.error('An error Occured');
    logger.error('Parsed Response', parsedResponse);
    logger.error('Raw', tokenResponse);
    return reply.code(500).send({
      error: `An error occured getting DaVinci token. See Glitch server logs for more details, code: ${parsedResponse.httpResponseCode}, message: '${parsedResponse.message}'.`,
    });
  }

  logger.log('Successfully retreived sdktoken for DaVinci', parsedResponse);

  reply.send({
    token: parsedResponse.access_token,
    companyId: companyId,
    apiRoot: dvBaseUrl,
  });
});

fastify.get('/setCookie', (request, reply) => {
  // IMPORTANT - In a production app you would want to do a sessionToken rotation here and set the cookie to the new token value
  // 1. Get the session from P1 based on the sessionToken from the request
  // 2. Compare the request IP Address with the session IP Address from P1 to ensure they match
  // 3. Set the sessionToken to a new GUID in P1
  // 4. Set the cookie to that new GUID like below

  const sessionToken = request.query.sessionToken;
  const sessionTokenMaxAge = request.query.sessionTokenMaxAge;

  reply.setCookie('DV-ST', sessionToken, {
    secure: true,
    httpOnly: 'httpOnly',
    sameSite: 'strict',
    path: '/',
    maxAge: sessionTokenMaxAge,
  });

  reply.send();
});

// Used to set a cookie that will be used to redirect to the correct vertical after logout using OIDC
fastify.get('/setVerticalCookie', (request, reply) => {
  reply.setCookie('redirectToVertical', request.query.currentVertical, {
    secure: true,
    httpOnly: 'httpOnly',
    sameSite: 'lax', // Must be lax or the cookie wont be sent on redirect from P1, this is not sensitive data so it's fine
    path: '/',
    maxAge: 60,
  });

  reply.send();
});

fastify.get('/logout', (_, reply) => {
  reply.clearCookie('DV-ST');
  reply.send();
});

fastify.get('/docs', (request, reply) => {
  const vertical = request.query.vertical || 'company';
  const icons = fs
    .readdirSync('src/partials/icons')
    .map((file) =>
      file.replace('.hbs', '').replace(/-./g, (x) => x[1].toUpperCase())
    ); // remove file extension and conver kebab-case to camelCase
  return reply.view('src/docs/index.hbs', {
    selectedVertical: vertical,
    verticals: verticals.filter((v) => v !== 'generic'),
    brandingPartial: () => `${vertical}Branding`,
    icons: icons.map((icon) => ({ icon: icon, partial: icon + 'Icon' })),
    ...helpers.getSettingsFile(vertical),
  });
});

fastify.get('/verticals', (_, reply) => {
  reply
    .code(200)
    .header('Content-Type', 'application/json; charset=utf-8')
    .send(verticals);
});

// Set up shortcuts endpoints, shows all verticals with applicable links
fastify.get('/shortcuts', (req, reply) => {
  const viewParams = verticals.map((vertical) => {
    const endpointLinks = helpers.getVerticalLinks(vertical);

    const settings = helpers.getSettingsFile(vertical).settings;
    return {
      name: settings.title,
      logo: settings.images.dialog_logo || settings.images.logo,
      endpointLinks,
    };
  });

  viewParams.showEditLinks = enableEditing;

  logger.log('/shortcuts endpoint hit, sending view data', viewParams);
  return reply.view('src/pages/shortcuts.hbs', viewParams);
});

// We can allow on this even if editing is disabled just in case something gets edited and we want to revert to default settings
fastify.post('/settings/reset', function (_, reply) {
  helpers.getVerticals().forEach((vertical) => {
    fs.copyFileSync(
      `./settings/${vertical}.json`,
      `./src/pages/${vertical}/settings.json`
    );
  });
  reply.code(200).send();
});

// Generic does not have dashboard or dialog-examples page
helpers.getVerticals().forEach((vertical) => {
  // Do this here so it's in sync with endpoints (e.g. if a user adds a page without restarting server it won't be navigatable yet)
  const verticalLinks = helpers.getVerticalLinks(vertical);

  for (const [filename, endpoint] of Object.entries(
    helpers.getVerticalEndpoints(vertical)
  )) {
    fastify.get(endpoint, function (req, reply) {
      const pageViewParams = getViewParams(vertical); // Must get these within endpoint or settings.json changes won't be picked up until server restarts
      const {
        Home,
        ['Dialog Examples']: _,
        ...authenticatedEndpoints
      } = verticalLinks; // Use object destructuring to filter out Home and Dialog Examples links
      pageViewParams.verticalAuthenticatedEndpoints = authenticatedEndpoints;

      // Get query parameter to conditionally show the edit drawer
      pageViewParams.showEditDrawer = false;

      if (enableEditing && req.query['edit']) {
        pageViewParams.showEditDrawer = true;
        pageViewParams.editorMapping = helpers.getEditorMappingFile(vertical);
        const currentPage = endpoint.split('/').pop();

        // If the current page is the vertical root, we are on the home page
        pageViewParams.currentPage =
          currentPage === vertical ? 'home' : currentPage;
      }

      logger.log(`${endpoint} hit, send page with view data`, pageViewParams);
      return reply.view(filename, pageViewParams);
    });
  }

  fastify.post(`/${vertical}/settings/reset`, function (_, reply) {
    fs.copyFileSync(
      `./settings/${vertical}.json`,
      `./src/pages/${vertical}/settings.json`
    );
    reply.code(200).send();
  });

  // Save value from editor
  fastify.put(
    `/${vertical}/settings`,
    {
      schema: {
        body: {
          type: 'object',
          required: ['jsonPath', 'value'],
          properties: {
            jsonPath: { type: 'string' },
            value: { type: 'string' },
          },
        },
      },
    },
    async function (req, reply) {
      if (!enableEditing) {
        reply
          .code(403)
          .send(
            'Editing is currently disabled, set BXI_ENABLE_EDITING=true in your .env if this is a mistake'
          );
        return;
      }

      const path = `./src/pages/${vertical}/settings.json`;

      // We don't want to use the getSettingFile helper here because we don't want to override the currentYear and other handles
      const verticalSettings = JSON.parse(fs.readFileSync(path));

      // This chunk of code iterates through the settings obj to find the correct path to update
      const stack = req.body.jsonPath.split('.');
      let settingsRef = verticalSettings;

      while (stack.length > 1) {
        settingsRef = settingsRef[stack.shift()];
      }

      settingsRef[stack.shift()] = req.body.value;

      fs.writeFileSync(path, JSON.stringify(verticalSettings, null, 2));

      reply.code(200).send();
    }
  );

  // Generic does not have dashboard or dialog examples pages
  if (vertical === 'generic') {
    return;
  }

  // Manifest file so each vertical can be installed as a PWA
  fastify.get(`/${vertical}/manifest.json`, function (_, reply) {
    const name = `BX${vertical.charAt(0).toUpperCase()}${vertical.slice(1)}`;
    reply.code(200).send({
      name: name,
      short_name: name,
      display: 'standalone',
      start_url: `/${vertical}`,
      scope: `/${vertical}`,
      icons: [
        {
          src: 'apple-touch-icon-192.png',
          type: 'image/png',
          sizes: '192x192',
        },
        {
          src: 'apple-touch-icon-512.png',
          type: 'image/png',
          sizes: '512x512',
        },
      ],
    });
  });

  // Vertical Dialog Examples Page
  fastify.get(`/${vertical}/dialog-examples`, function (_, reply) {
    const viewParams = helpers.getSettingsFile(vertical);
    const settings = helpers.getSettingsFile(vertical).settings;

    viewParams.vertical = vertical;
    viewParams.brandingPartial = () => `${vertical}Branding`;
    viewParams.dialogLogo = settings.images.dialog_logo;
    viewParams.favicon = settings.images.favicon || '/generic/favicon.ico';
    viewParams.appleTouchIcon =
      settings.images.apple_touch_icon || '/generic/apple-touch-icon.png';

    logger.log(
      `/${vertical}/dialog-examples hit, sending view data`,
      viewParams
    );
    return reply.view(`src/pages/dialog-examples.hbs`, viewParams);
  });

  // Redirect old /admin urls to dashboard
  fastify.get(`/${vertical}/admin`, function (_, reply) {
    logger.log(`/${vertical}/admin hit, redirecting to dashboard instead`);
    reply.redirect(`/${vertical}/dashboard`);
  });
});

// Just in case /generic/dashboard is hit, redirect to generic
fastify.get('/generic/dashboard', (_, reply) => {
  logger.log(
    `/generic/dashboard hit, redirecting to /generic since this doesn't exist`
  );
  reply.redirect('/generic');
});

// Redirect 404s to base url rather than throwing errors
fastify.setNotFoundHandler((_, reply) => {
  logger.log('Invalid url, redirecting to root');
  reply.redirect('/');
});

// Combine settings.json with environment parameters to be passed to handlebars templates/front-end
// Please note .env parameters are manually whitelisted in resources/handlebars.js for security reasons
function getViewParams(vertical) {
  let params = helpers.getSettingsFile(vertical);
  params.vertical = vertical;
  params.env = bxiEnvVars;
  return params;
}

// Run the server and report out to the logs
fastify.listen({ port, host: '0.0.0.0' }, function (err, address) {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }

  console.log(`Your app is listening on ${address}`);
  fastify.log.info(`server listening on ${address}`);
});

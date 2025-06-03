import handlebars from 'handlebars';
import util from 'handlebars-utils';
import fs from 'fs';
import helpers from './helpers.js';

export function initHandlebars(fastify) {
    initHandlebarsHelpers(handlebars);

    // View is a templating manager for fastify
    fastify.register(import('@fastify/view'), {
        engine: {
          handlebars: handlebars,
        },
        options: {
            partials: {
                homeNavButtons: 'src/home-nav-buttons.hbs',
                dashboardButtons: 'src/dashboard-buttons.hbs',
                ...getBrandingPartials(),
                ...getPartialsFromDirectory('src/partials'),
                ...getPartialsFromDirectory('src/partials/icons', 'Icon'),
                ...getPartialsFromDirectory('src/templates', 'Template')
            }
        }
    });
}

/**
 * Register Handlebars helper functions
 * 
 * @param {object} hbs Imported handlebars instance, this needs to be passed because it is used for trials compilation
 */
export function initHandlebarsHelpers(hbs, pathPrefix = '') {
    hbs.registerHelper('inlineSvg', (value, _) => {
        if (!value.startsWith('/')) {
            value = `/${value}`;
        }

        return fs.readFileSync(`${pathPrefix}public${value}`);
    });

    hbs.registerHelper('times', function(n, block) {
        var accum = '';
        for(var i = 0; i < n; ++i)
            accum += block.fn(i);
        return accum;
    });

    hbs.registerHelper('lookupPath', function(arg1, options) {
        return arg1.split('.').reduce((r, k) => r[k], options.data.root);
    });

    /** 
     * These helpers are all copy/pasted from the handlebars-helpers library.
     * Unfortunately the library has been abandoned and has critical vulnerabilities so I decided to
     * just manually bring in the ones we need, others can be added here in the future if needed
     * 
     * @see https://github.com/jonathas/handlebars-helpers
     */
    hbs.registerHelper('eq', function(a, b, options) {
        if (arguments.length === 2) {
            options = b;
            b = options.hash.compare;
        }
        return util.value(a === b, this, options);
    });

    hbs.registerHelper('gt', function(a, b, options) {
        if (arguments.length === 2) {
          options = b;
          b = options.hash.compare;
        }
        return util.value(a > b, this, options);
    });

    hbs.registerHelper('isnt', function(a, b, options) {
        if (arguments.length === 2) {
            options = b;
            b = options.hash.compare;
          }
          return util.value(a != b, this, options);
    });

    hbs.registerHelper('and', function() {
        var len = arguments.length - 1;
        var options = arguments[len];
        var val = true;
      
        for (var i = 0; i < len; i++) {
          if (!arguments[i]) {
            val = false;
            break;
          }
        }
      
        return util.value(val, this, options);
    });

    hbs.registerHelper('length', function(value) {
        if (util.isObject(value) && !util.isOptions(value)) {
          value = Object.keys(value);
        }
        if (typeof value === 'string' || Array.isArray(value)) {
          return value.length;
        }
        return 0;
    });
}

/**
 * Gets all partials from a directory and names the partials based on kebab-file-name-case -> camelCase + suffix
 * 
 * e.g., sign-in-email-otp.hbs -> signInEmailOtp<suffix>
 * 
 * @param {string} directory directory to search for .hbs partials
 * @param {string} suffix suffix to use when naming partials
 * @returns Object with key value pairs of partials { [partialName]: '<file-location>' }
 */
export function getPartialsFromDirectory(directory, suffix = '') {
    return fs.readdirSync(directory)
        .reduce((acc, file) => 
            (file.endsWith('.hbs') ? { ...acc,  [`${file.replace('.hbs', '').replace(/-./g, x => x[1].toUpperCase())}${suffix}`]: `${directory}/${file}`} : acc), {});
}

/**
 * 
 * @returns object containing branding partials { ['<vertical>Branding']: '<file-location>'}
 */
function getBrandingPartials() {
    // Generic does not have branding and is filtered out
    return helpers.getVerticals().filter(vertical => vertical !== 'generic').reduce((acc, vertical) => {
       return { ...acc, [`${vertical}Branding`]: `src/pages/${vertical}/branding.hbs` };
    }, {});
}
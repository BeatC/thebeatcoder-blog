// # Bootup
// This file needs serious love & refactoring

// Module dependencies
var express     = require('express'),
    hbs         = require('express-hbs'),
    compress    = require('compression'),
    uuid        = require('node-uuid'),
    Promise     = require('bluebird'),
    i18n        = require('./i18n'),
    api         = require('./api'),
    config      = require('./config'),
    errors      = require('./errors'),
    helpers     = require('./helpers'),
    middleware  = require('./middleware'),
    migrations  = require('./data/migration'),
    models      = require('./models'),
    permissions = require('./permissions'),
    apps        = require('./apps'),
    sitemap     = require('./data/xml/sitemap'),
    xmlrpc      = require('./data/xml/xmlrpc'),
    GhostServer = require('./ghost-server'),
    validateThemes = require('./utils/validate-themes'),

    dbHash;

var ServerApp = function (options) {
    options = options || {};

    return this.init(options);
};

ServerApp.prototype.configuration = function () {
    // ##Configuration

    // return the correct mime type for woff files
    this._setMime();
    this._enableGzip();
    this._setViewEngine();

    // ## Middleware and Routing
    middleware(this.blogApp, this.adminApp);

    this._validateThemes();

    return new GhostServer(this.blogApp);
};

ServerApp.prototype._setMime = function () {
    express.static.mime.define({'application/font-woff': ['woff']});
};

ServerApp.prototype._setViewEngine = function () {
    var adminHbs = hbs.create();

    // ## View engine
    // set the view engine
    this.blogApp.set('view engine', 'hbs');

    // Create a hbs instance for admin and init view engine
    this.adminApp.set('view engine', 'hbs');
    this.adminApp.engine('hbs', adminHbs.express3({}));

    // Load helpers
    helpers.loadCoreHelpers(adminHbs);
};

ServerApp.prototype._validateThemes = function () {
    // Log all theme errors and warnings
    validateThemes(config.paths.themePath)
        .catch(this._catchThemeValidationErrors.bind(this));
};

ServerApp.prototype._catchThemeValidationErrors = function (result) {
    // TODO: change `result` to something better
    this._logErrors(result.errors);
    this._logWarnings(result.warnings);
};

ServerApp.prototype._logErrors = function (errorsCollection) {
    errorsCollection.forEach(function (err) {
        errors.logError(err.message, err.context, err.help);
    });
};

ServerApp.prototype._logWarnings = function (warningsCollection) {
    warningsCollection.forEach(function (warn) {
        errors.logWarn(warn.message, warn.context, warn.help);
    });
};

ServerApp.prototype._enableGzip = function () {
    // enabled gzip compression by default
    if (config.server.compress !== false) {
        this.blogApp.use(compress());
    }
};

ServerApp.prototype.initDbHashAndFirstRun = function () {
    return api.settings.read({key: 'dbHash', context: {internal: true}}).then(function (response) {
        var hash = response.settings[0].value,
            initHash;

        dbHash = hash;

        if (dbHash === null) {
            initHash = uuid.v4();
            return api.settings.edit({settings: [{key: 'dbHash', value: initHash}]}, {context: {internal: true}})
                .then(function (response) {
                    dbHash = response.settings[0].value;
                    return dbHash;
                    // Use `then` here to do 'first run' actions
                });
        }

        return dbHash;
    });
};

// ## Initialise Ghost
// Sets up the express server instances, runs init on a bunch of stuff, configures views, helpers, routes and more
// Finally it returns an instance of GhostServer
ServerApp.prototype.init = function init(options) {
    var that = this;

    this._createApps();

    // ### Initialisation
    // The server and its dependencies require a populated config
    // It returns a promise that is resolved when the application
    // has finished starting up.

    // Initialize Internationalization
    i18n.init();

    // Load our config.js file from the local file system.
    return config.load(options.config).then(function () {
        return config.checkDeprecated();
    }).then(function () {
        // Initialise the models
        return models.init();
    }).then(function () {
        // Initialize migrations
        return migrations.init();
    }).then(function () {
        // Populate any missing default settings
        return models.Settings.populateDefaults();
    }).then(function () {
        // Initialize the settings cache
        return api.init();
    }).then(function () {
        // Initialize the permissions actions and objects
        // NOTE: Must be done before initDbHashAndFirstRun calls
        return permissions.init();
    }).then(function () {
        return Promise.join(
            // Check for or initialise a dbHash.
            that.initDbHashAndFirstRun(),
            // Initialize apps
            apps.init(),
            // Initialize sitemaps
            sitemap.init(),
            // Initialize xmrpc ping
            xmlrpc.init()
        );
    }).then(that.configuration.bind(that));
};

ServerApp.prototype._createApps = function () {
    // Get reference to an express app instance.
    this.blogApp = express();
    this.adminApp = express();
};

module.exports = ServerApp;

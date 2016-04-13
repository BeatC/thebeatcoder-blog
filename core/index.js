// ## Server Loader
// Passes options through the boot process to get a server instance back
var ServerApp = require('./server');

// Set the default environment to be `development`
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

function makeGhost(options) {
    options = options || {};
    return new ServerApp(options);
}

module.exports = makeGhost;

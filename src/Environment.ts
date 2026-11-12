// Loads the connections' settings from a .env file, when there is one, as soon as Drivine is imported.
require('dotenv').config({
    path: process.env.DOTENV_CONFIG_PATH || require('find-config')('.env')
});

// Stack traces name the TypeScript sources' lines. Node only: a page's own tools map them there.
require('source-map-support').install({ environment: 'node' });

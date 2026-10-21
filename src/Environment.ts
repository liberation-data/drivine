// Loads the connections' settings from a .env file, when there is one, as soon as Drivine is imported.
require('dotenv').config({
    path: process.env.DOTENV_CONFIG_PATH || require('find-config')('.env')
});

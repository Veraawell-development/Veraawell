/**
 * Server Entry Point
 * This file is the main entry point for the application
 */

const { startServer } = require('./server.js');

// Start the server
startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
});

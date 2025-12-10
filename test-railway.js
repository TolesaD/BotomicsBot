// Simulate Railway environment
process.env.RAILWAY_ENVIRONMENT = 'production';
process.env.PORT = '3000';
process.env.NODE_ENV = 'production';

// Start app
require('./src/app.js');
const BanHandler = require('../handlers/banHandler');

/**
 * Middleware to check if user is banned before processing messages
 */
const banCheckMiddleware = async (ctx, next) => {
  try {
    // Skip for specific commands that should always be available
    const allowedCommands = ['start', 'help', 'cancel'];
    if (ctx.message?.text && allowedCommands.some(cmd => ctx.message.text.startsWith(`/${cmd}`))) {
      return next();
    }

    return BanHandler.banCheckMiddleware()(ctx, next);
    
  } catch (error) {
    console.error('Ban check middleware error:', error);
    return next();
  }
};

module.exports = banCheckMiddleware;
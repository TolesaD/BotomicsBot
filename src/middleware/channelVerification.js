const ChannelJoinHandler = require('../handlers/channelJoinHandler');

/**
 * Middleware to check channel membership before allowing access to messages
 */
const channelVerificationMiddleware = async (ctx, next) => {
  try {
    const { metaBotInfo } = ctx;
    if (!metaBotInfo || !ctx.from) {
      return next();
    }

    // Skip for platform admin
    const PlatformAdminHandler = require('../handlers/platformAdminHandler');
    if (PlatformAdminHandler.isPlatformCreator(ctx.from.id)) {
      return next();
    }

    // Skip verification for admins
    const isAdmin = await ctx.miniBotManager?.checkAdminAccess(metaBotInfo.mainBotId, ctx.from.id);
    if (isAdmin) {
      return next();
    }

    // Only check channel membership for regular messages (not commands like /start)
    // This allows users to see the welcome message and understand what the bot does
    if (ctx.message && !ctx.message.text?.startsWith('/')) {
      const membershipCheck = await ChannelJoinHandler.checkChannelMembership(
        ctx, 
        metaBotInfo.mainBotId, 
        ctx.from.id
      );

      if (membershipCheck.required && !membershipCheck.joined) {
        // Show join wall instead of proceeding
        await ChannelJoinHandler.showJoinWall(ctx, metaBotInfo, membershipCheck);
        return;
      }
    }

    return next();

  } catch (error) {
    console.error('Channel verification middleware error:', error);
    return next();
  }
};

module.exports = channelVerificationMiddleware;
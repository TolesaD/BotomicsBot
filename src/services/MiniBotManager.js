// src/services/MiniBotManager.js - FIXED CUSTOM BOT DETECTION
const { Telegraf, Markup } = require('telegraf');
const { Bot, UserLog, Feedback, Admin, User, BroadcastHistory } = require('../models');

class MiniBotManager {
  constructor() {
    this.activeBots = new Map();
    this.broadcastSessions = new Map();
    this.replySessions = new Map();
    this.adminSessions = new Map();
    this.messageFlowSessions = new Map();
    this.welcomeMessageSessions = new Map();
    this.customCommandSessions = new Map();
    this.initializationPromise = null;
    this.isInitialized = false;
    this.initializationAttempts = 0;
    this.maxInitializationAttempts = 5;
  }
  
  deleteAfterDelay = async (ctx, messageId, delay = 5000) => {
    try {
      setTimeout(async () => {
        try {
          await ctx.deleteMessage(messageId);
        } catch (error) {
          console.log('Message already deleted or not accessible');
        }
      }, delay);
    } catch (error) {
      console.error('Error setting up message deletion:', error);
    }
  };
  
  async initializeAllBots() {
    if (this.initializationPromise) {
      console.log('🔄 Initialization already in progress, waiting...');
      return this.initializationPromise;
    }
    
    this.initializationPromise = this._initializeAllBots();
    const result = await this.initializationPromise;
    this.initializationPromise = null;
    return result;
  }
  
  async _initializeAllBots() {
    try {
      console.log('🔄 CRITICAL: Starting mini-bot initialization on server startup...');
      
      await this.clearAllBots();
      
      console.log('⏳ Waiting for database to be fully ready...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const activeBots = await Bot.findAll({ where: { is_active: true } });
      
      console.log(`📊 Found ${activeBots.length} active bots in database to initialize`);
      
      if (activeBots.length === 0) {
        console.log('ℹ️ No active bots found in database - this is normal for new deployment');
        this.isInitialized = true;
        return 0;
      }
      
      let successCount = 0;
      let failedCount = 0;
      
      for (const botRecord of activeBots) {
        try {
          console.log(`\n🔄 Attempting to initialize: ${botRecord.bot_name} (ID: ${botRecord.id}, Type: ${botRecord.bot_type})`);
          
          const owner = await User.findOne({ where: { telegram_id: botRecord.owner_id } });
          if (owner && owner.is_banned) {
            console.log(`🚫 Skipping bot ${botRecord.bot_name} - owner is banned`);
            await botRecord.update({ is_active: false });
            failedCount++;
            continue;
          }
          
          const success = await this.initializeBotWithEncryptionCheck(botRecord);
          
          if (success) {
            successCount++;
            console.log(`✅ Initialization started: ${botRecord.bot_name} (${botRecord.bot_type})`);
          } else {
            failedCount++;
            console.error(`❌ Failed to initialize: ${botRecord.bot_name}`);
          }
          
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error) {
          console.error(`💥 Critical error initializing bot ${botRecord.bot_name}:`, error.message);
          failedCount++;
          console.log(`🔄 Continuing with next bot despite error...`);
        }
      }
      
      console.log(`\n🎉 INITIALIZATION SUMMARY: ${successCount}/${activeBots.length} mini-bots initialization started (${failedCount} failed)`);
      
      console.log('⏳ Waiting for bots to complete launch...');
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      this.isInitialized = true;
      this.debugActiveBots();
      
      return successCount;
      
    } catch (error) {
      console.error('💥 CRITICAL: Error initializing all bots:', error);
      this.isInitialized = false;
      return 0;
    }
  }
  
  async initializeBotWithEncryptionCheck(botRecord) {
    try {
      console.log(`🔐 Testing encryption for bot: ${botRecord.bot_name}`);
      
      const decryptionTest = await botRecord.testTokenDecryption();
      if (!decryptionTest.success) {
        console.error(`❌ Token decryption failed for ${botRecord.bot_name}: ${decryptionTest.message}`);
        return false;
      }
      
      console.log(`✅ Token decryption test passed for: ${botRecord.bot_name}`);
      return await this.initializeBot(botRecord);
      
    } catch (error) {
      console.error(`💥 Encryption check failed for ${botRecord.bot_name}:`, error.message);
      return false;
    }
  }

  async clearAllBots() {
    console.log('🔄 Clearing all existing bot instances...');
    const botIds = Array.from(this.activeBots.keys());
    
    for (const botId of botIds) {
      try {
        await this.stopBot(botId);
      } catch (error) {
        console.error(`Error stopping bot ${botId}:`, error);
      }
    }
    
    console.log(`✅ Cleared ${botIds.length} bot instances`);
  }
  
  async initializeBot(botRecord) {
    try {
      console.log(`🔄 Starting initialization for: ${botRecord.bot_name} (DB ID: ${botRecord.id}, Type: ${botRecord.bot_type})`);
      
      if (this.activeBots.has(botRecord.id)) {
        console.log(`⚠️ Bot ${botRecord.bot_name} (DB ID: ${botRecord.id}) is already active, stopping first...`);
        await this.stopBot(botRecord.id);
      }
      
      console.log(`🔐 Getting decrypted token for: ${botRecord.bot_name}`);
      const token = botRecord.getDecryptedToken();
      if (!token) {
        console.error(`❌ No valid token for bot ${botRecord.bot_name}`);
        return false;
      }
      
      if (!this.isValidBotToken(token)) {
        console.error(`❌ Invalid token format for bot ${botRecord.bot_name}`);
        return false;
      }
      
      console.log(`🔄 Creating Telegraf instance for: ${botRecord.bot_name}`);
      
      const bot = new Telegraf(token, {
        handlerTimeout: 120000,
        telegram: { 
          apiRoot: 'https://api.telegram.org',
          agent: null
        }
      });
      
      // CRITICAL FIX: Store the actual bot record in context
      bot.context.metaBotInfo = {
        mainBotId: botRecord.id,
        botId: botRecord.bot_id,
        botName: botRecord.bot_name,
        botUsername: botRecord.bot_username,
        botRecord: botRecord, // Store the full record
        isCustomBot: botRecord.bot_type === 'custom' // Explicit flag
      };
      
      // CRITICAL FIX: Setup handlers based on bot type
      this.setupHandlers(bot, botRecord);
      
      await this.setBotCommands(bot, token);
      
      console.log(`🚀 Launching bot: ${botRecord.bot_name}`);
      
      this.activeBots.set(botRecord.id, { 
        instance: bot, 
        record: botRecord,
        token: token,
        launchedAt: new Date(),
        status: 'launching'
      });
      
      bot.launch({
        dropPendingUpdates: true,
        allowedUpdates: ['message', 'callback_query', 'my_chat_member']
      }).then(() => {
        console.log(`✅ Bot launch completed: ${botRecord.bot_name}`);
        const botData = this.activeBots.get(botRecord.id);
        if (botData) {
          botData.status = 'active';
          botData.launchedAt = new Date();
        }
      }).catch(launchError => {
        console.error(`❌ Bot launch failed for ${botRecord.bot_name}:`, launchError.message);
        try {
          bot.startPolling();
          console.log(`✅ Bot started with polling: ${botRecord.bot_name}`);
          const botData = this.activeBots.get(botRecord.id);
          if (botData) botData.status = 'active';
        } catch (pollError) {
          console.error(`❌ Alternative launch failed:`, pollError.message);
          this.activeBots.delete(botRecord.id);
        }
      });
      
      return true;
      
    } catch (error) {
      console.error(`❌ Failed to start bot ${botRecord.bot_name}:`, error.message);
      this.activeBots.delete(botRecord.id);
      return false;
    }
  }

  // FIXED: Setup handlers with proper bot type detection
  setupHandlers = (bot, botRecord) => {
    console.log(`🔄 Setting up handlers for ${botRecord.bot_name} (Type: ${botRecord.bot_type})`);
    
    bot.use(async (ctx, next) => {
      ctx.miniBotManager = this;
      
      // CRITICAL FIX: Ensure metaBotInfo is always available
      if (!ctx.metaBotInfo) {
        const botData = this.activeBots.get(botRecord.id);
        if (botData) {
          ctx.metaBotInfo = botData.instance.context.metaBotInfo;
        }
      }
      
      if (ctx.from) {
        const user = await User.findOne({ where: { telegram_id: ctx.from.id } });
        if (user && user.is_banned) {
          await ctx.reply('🚫 Your account has been banned.');
          return;
        }
      }
      
      if (ctx.from && ctx.metaBotInfo) {
        await this.setBotCommands(bot, null, ctx.from.id);
      }
      
      return next();
    });
    
    // Common handlers for all bots
    bot.start((ctx) => this.handleStart(ctx));
    bot.help((ctx) => this.handleHelp(ctx));
    
    // CRITICAL FIX: Different handler order based on bot type
    if (botRecord.bot_type === 'custom') {
      console.log(`🛠️ Setting up CUSTOM bot handlers for: ${botRecord.bot_name}`);
      
      // For custom bots: Handle custom commands FIRST
      bot.on('text', (ctx) => this.handleCustomCommands(ctx));
      bot.on('callback_query', (ctx) => this.handleCustomCommandCallbacks(ctx));
      
      // Then admin commands
      bot.command('dashboard', (ctx) => this.handleDashboard(ctx));
      bot.command('broadcast', (ctx) => this.handleBroadcastCommand(ctx));
      bot.command('stats', (ctx) => this.handleStatsCommand(ctx));
      bot.command('admins', (ctx) => this.handleAdminsCommand(ctx));
      bot.command('settings', (ctx) => this.handleSettingsCommand(ctx));
      
      // Then other message types
      bot.on('text', (ctx) => this.handleTextMessage(ctx));
      
    } else {
      console.log(`🎯 Setting up QUICK bot handlers for: ${botRecord.bot_name}`);
      
      // For quick bots: Regular order
      bot.command('dashboard', (ctx) => this.handleDashboard(ctx));
      bot.command('broadcast', (ctx) => this.handleBroadcastCommand(ctx));
      bot.command('stats', (ctx) => this.handleStatsCommand(ctx));
      bot.command('admins', (ctx) => this.handleAdminsCommand(ctx));
      bot.command('settings', (ctx) => this.handleSettingsCommand(ctx));
      
      bot.on('text', (ctx) => this.handleTextMessage(ctx));
    }
    
    // Common media handlers for both types
    bot.on('photo', (ctx) => this.handleImageMessage(ctx));
    bot.on('video', (ctx) => this.handleVideoMessage(ctx));
    bot.on('document', (ctx) => this.handleDocumentMessage(ctx));
    bot.on('audio', (ctx) => this.handleAudioMessage(ctx));
    bot.on('voice', (ctx) => this.handleVoiceMessage(ctx));
    bot.on('media_group', (ctx) => this.handleMediaGroupMessage(ctx));
    
    // Action handlers
    bot.action(/^mini_(.+)/, (ctx) => this.handleMiniAction(ctx));
    bot.action(/^reply_(.+)/, (ctx) => this.handleReplyAction(ctx));
    bot.action(/^admin_(.+)/, (ctx) => this.handleAdminAction(ctx));
    bot.action(/^remove_admin_(.+)/, (ctx) => this.handleRemoveAdminAction(ctx));
    bot.action(/^settings_(.+)/, (ctx) => this.handleSettingsAction(ctx));
    
    bot.catch((error, ctx) => {
      console.error(`Error in mini-bot ${ctx.metaBotInfo?.botName}:`, error);
    });
    
    console.log('✅ Bot handlers setup complete');
  };

  // FIXED: Start handler with proper custom bot detection
  handleStart = async (ctx) => {
    try {
      const { metaBotInfo } = ctx;
      
      // CRITICAL FIX: Validate metaBotInfo exists
      if (!metaBotInfo) {
        console.error('❌ metaBotInfo is undefined in start handler');
        return await ctx.reply('🤖 Welcome! This bot is being configured. Please try again later.');
      }

      const user = ctx.from;
      
      console.log(`🚀 Start command received for ${metaBotInfo.botName} (Type: ${metaBotInfo.botRecord.bot_type}) from ${user.first_name}`);
      
      // Set bot commands for menu
      await this.setBotCommands(ctx.telegram, null, user.id);
      
      // Safe user logging with validation
      try {
        const botExists = await Bot.findByPk(metaBotInfo.mainBotId);
        if (!botExists) {
          console.error(`❌ Bot with ID ${metaBotInfo.mainBotId} not found, skipping user log`);
        } else {
          await UserLog.upsert({
            bot_id: metaBotInfo.mainBotId,
            user_id: user.id,
            user_username: user.username,
            user_first_name: user.first_name,
            last_interaction: new Date(),
            first_interaction: new Date(),
            interaction_count: 1
          });
        }
      } catch (dbError) {
        console.error('❌ User log error:', dbError.message);
      }
      
      const isAdmin = await this.checkAdminAccess(metaBotInfo.mainBotId, user.id);
      
      if (isAdmin) {
        await this.showAdminDashboard(ctx, metaBotInfo);
      } else {
        // CRITICAL FIX: Show appropriate welcome based on bot type
        await this.showUserWelcome(ctx, metaBotInfo);
      }
      
    } catch (error) {
      console.error('💥 Start handler error:', error);
      await ctx.reply('👋 Welcome! There was a temporary issue. Please try again.');
    }
  };

  // NEW: Enhanced user welcome that handles both quick and custom bots
  showUserWelcome = async (ctx, metaBotInfo) => {
    try {
      const user = ctx.from;
      const botRecord = metaBotInfo.botRecord;
      
      console.log(`🎯 Showing welcome for ${botRecord.bot_type} bot: ${botRecord.bot_name}`);
      
      // Handle custom bots with custom flows
      if (botRecord.bot_type === 'custom') {
        await this.showCustomBotWelcome(ctx, metaBotInfo, user);
      } else {
        // Default quick bot welcome
        await this.showQuickBotWelcome(ctx, metaBotInfo);
      }
    } catch (error) {
      console.error('Welcome message error:', error);
      // Fallback to basic welcome
      await ctx.reply(`👋 Hello ${ctx.from.first_name}! Welcome to ${metaBotInfo.botName}.`);
    }
  };

  // NEW: Custom bot welcome handler
  showCustomBotWelcome = async (ctx, metaBotInfo, user) => {
    try {
      const botRecord = metaBotInfo.botRecord;
      
      console.log(`🛠️ Showing CUSTOM bot welcome for: ${botRecord.bot_name}`);
      
      // Check for custom welcome message or flow
      if (botRecord.custom_flow_data && botRecord.custom_flow_data.welcome_message) {
        const welcomeMessage = botRecord.custom_flow_data.welcome_message.replace(/{botName}/g, metaBotInfo.botName);
        await ctx.replyWithMarkdown(welcomeMessage);
        
        // Check if there's an auto-start flow
        const autoStartStep = botRecord.custom_flow_data.steps?.find(step => 
          step.type === 'trigger' && step.auto_start === true
        );
        
        if (autoStartStep) {
          await this.startCustomCommandFlow(ctx, metaBotInfo, user, botRecord.custom_flow_data, autoStartStep);
        }
      } else {
        // Default custom bot welcome
        await ctx.replyWithMarkdown(
          `🛠️ *Welcome to ${metaBotInfo.botName}!*\n\n` +
          `This is a custom command bot with interactive features.\n\n` +
          `*Available Commands:*\n` +
          `Use the menu (/) button to see available commands\n\n` +
          `_This bot was created with @MarCreatorBot_`
        );
      }
    } catch (error) {
      console.error('Custom bot welcome error:', error);
      await this.showQuickBotWelcome(ctx, metaBotInfo);
    }
  };

  // NEW: Quick bot welcome (extracted from existing code)
  showQuickBotWelcome = async (ctx, metaBotInfo) => {
    try {
      let welcomeMessage = await this.getWelcomeMessage(metaBotInfo.mainBotId);
      welcomeMessage = welcomeMessage.replace(/{botName}/g, metaBotInfo.botName);
      await ctx.replyWithMarkdown(welcomeMessage);
    } catch (error) {
      console.error('Quick bot welcome error:', error);
      await ctx.replyWithMarkdown(`👋 Welcome to *${metaBotInfo.botName}*!\n\nWe are here to assist you with any questions or concerns you may have.\n\nSimply send us a message, and we'll respond as quickly as possible!\n\n_This Bot is created by @MarCreatorBot_`);
    }
  };

  // FIXED: Custom command handler with better bot type detection
  handleCustomCommands = async (ctx) => {
    try {
      const { metaBotInfo } = ctx;
      const user = ctx.from;
      const message = ctx.message.text;

      console.log(`🔧 Checking custom commands for bot ${metaBotInfo.botName}, type: ${metaBotInfo.botRecord.bot_type}`);

      // Only process custom commands for custom bots
      if (metaBotInfo.botRecord.bot_type === 'custom') {
        console.log(`🛠️ Processing as CUSTOM bot: ${metaBotInfo.botName}`);
        
        // Try to process custom command flow
        const customCommandResult = await this.processCustomCommandFlow(ctx, metaBotInfo, user, message);
        if (customCommandResult && customCommandResult.handled) {
          console.log(`✅ Custom command handled for user ${user.id}`);
          return; // Stop further processing
        }
        
        // If no custom command matched, check if it's a regular command
        if (message.startsWith('/')) {
          console.log(`📋 Regular command in custom bot: ${message}`);
          // Let the regular command handlers process it
          return;
        }
        
        // For non-command messages in custom bots, handle specially
        await this.handleUserMessageInCustomBot(ctx, metaBotInfo, user, message);
        return;
      }

      // If quick bot, continue with regular admin/user flow
      const isAdmin = await this.checkAdminAccess(metaBotInfo.mainBotId, user.id);
      if (isAdmin) {
        await this.showAdminDashboard(ctx, metaBotInfo);
        return;
      }

      await this.handleUserMessage(ctx, metaBotInfo, user, message);
      
    } catch (error) {
      console.error('Custom command handler error:', error);
      // Fall back to regular message handling
      await this.handleTextMessage(ctx);
    }
  };
  };

  // NEW: Special handler for user messages in custom bots
  handleUserMessageInCustomBot = async (ctx, metaBotInfo, user, message) => {
    try {
      // Check if user is in an active custom flow session
      const sessionKey = `${user.id}_${metaBotInfo.mainBotId}`;
      const userSession = this.customCommandSessions.get(sessionKey);
      
      if (userSession) {
        // User is in an active flow, continue it
        await this.continueCustomCommandFlow(ctx, metaBotInfo, user, message, userSession);
        return;
      }
      
      // If no active session and no custom command matched, treat as regular user message
      await this.handleUserMessage(ctx, metaBotInfo, user, message);
      
    } catch (error) {
      console.error('Custom bot user message error:', error);
      await this.handleUserMessage(ctx, metaBotInfo, user, message);
    }
  };

  // NEW: Process custom command flows
  processCustomCommandFlow = async (ctx, metaBotInfo, user, message) => {
    try {
      const botRecord = metaBotInfo.botRecord;
      
      // Check if user is in an active custom command session
      const sessionKey = `${user.id}_${metaBotInfo.mainBotId}`;
      const userSession = this.customCommandSessions.get(sessionKey);
      
      // Handle session continuation
      if (userSession) {
        return await this.continueCustomCommandFlow(ctx, metaBotInfo, user, message, userSession);
      }
      
      // Handle new command triggers
      if (botRecord.custom_flow_data) {
        const flow = botRecord.custom_flow_data;
        
        // Check if message matches any command trigger
        for (const step of flow.steps || []) {
          if (step.type === 'trigger' && step.trigger === message) {
            console.log(`🎯 Custom command triggered: ${message}`);
            await this.startCustomCommandFlow(ctx, metaBotInfo, user, flow, step);
            return { handled: true };
          }
        }
        
        // Check for /start command to show custom welcome
        if (message === '/start' && flow.welcome_message) {
          await ctx.replyWithMarkdown(flow.welcome_message.replace(/{botName}/g, metaBotInfo.botName));
          return { handled: true };
        }
      }
      
      return { handled: false };
    } catch (error) {
      console.error('Custom command flow error:', error);
      return { handled: false };
    }
  };

  // NEW: Start custom command flow
  startCustomCommandFlow = async (ctx, metaBotInfo, user, flow, triggerStep) => {
    const sessionKey = `${user.id}_${metaBotInfo.mainBotId}`;
    
    this.customCommandSessions.set(sessionKey, {
      flow: flow,
      currentStepIndex: 0,
      userData: {},
      startedAt: new Date()
    });
    
    // Execute the first step
    await this.executeCustomCommandStep(ctx, metaBotInfo, user, sessionKey, 0);
  };

  // NEW: Continue custom command flow
  continueCustomCommandFlow = async (ctx, metaBotInfo, user, message, userSession) => {
    const sessionKey = `${user.id}_${metaBotInfo.mainBotId}`;
    const currentStep = userSession.flow.steps[userSession.currentStepIndex];
    
    // Handle user input based on current step type
    switch (currentStep.type) {
      case 'ask_question':
        // Store answer and move to next step
        userSession.userData[currentStep.variable] = message;
        userSession.currentStepIndex++;
        
        if (userSession.currentStepIndex < userSession.flow.steps.length) {
          await this.executeCustomCommandStep(ctx, metaBotInfo, user, sessionKey, userSession.currentStepIndex);
        } else {
          // Flow completed
          await this.completeCustomCommandFlow(ctx, metaBotInfo, user, userSession);
          this.customCommandSessions.delete(sessionKey);
        }
        break;
        
      case 'multiple_choice':
        // Handle multiple choice selection
        const selectedOption = currentStep.options.find(opt => 
          opt.text === message || opt.value === message
        );
        
        if (selectedOption) {
          userSession.userData[currentStep.variable] = selectedOption.value;
          userSession.currentStepIndex++;
          
          if (userSession.currentStepIndex < userSession.flow.steps.length) {
            await this.executeCustomCommandStep(ctx, metaBotInfo, user, sessionKey, userSession.currentStepIndex);
          } else {
            await this.completeCustomCommandFlow(ctx, metaBotInfo, user, userSession);
            this.customCommandSessions.delete(sessionKey);
          }
        } else {
          await ctx.reply('❌ Please select a valid option from the choices above.');
        }
        break;
        
      default:
        // For other step types, just move to next step
        userSession.currentStepIndex++;
        if (userSession.currentStepIndex < userSession.flow.steps.length) {
          await this.executeCustomCommandStep(ctx, metaBotInfo, user, sessionKey, userSession.currentStepIndex);
        } else {
          await this.completeCustomCommandFlow(ctx, metaBotInfo, user, userSession);
          this.customCommandSessions.delete(sessionKey);
        }
    }
    
    return { handled: true };
  };

  // NEW: Execute a specific step in custom command flow
  executeCustomCommandStep = async (ctx, metaBotInfo, user, sessionKey, stepIndex) => {
    const userSession = this.customCommandSessions.get(sessionKey);
    const step = userSession.flow.steps[stepIndex];
    
    switch (step.type) {
      case 'send_message':
        await ctx.replyWithMarkdown(this.replaceVariables(step.message, userSession.userData));
        userSession.currentStepIndex = stepIndex;
        break;
        
      case 'ask_question':
        await ctx.replyWithMarkdown(this.replaceVariables(step.question, userSession.userData));
        userSession.currentStepIndex = stepIndex;
        break;
        
      case 'multiple_choice':
        const options = step.options.map(opt => 
          [Markup.button.callback(opt.text, `custom_choice_${sessionKey}_${stepIndex}_${opt.value}`)]
        );
        
        const keyboard = Markup.inlineKeyboard(options);
        await ctx.replyWithMarkdown(this.replaceVariables(step.question, userSession.userData), keyboard);
        userSession.currentStepIndex = stepIndex;
        break;
        
      case 'conditional':
        // Evaluate condition and jump to appropriate step
        const conditionMet = this.evaluateCondition(step.condition, userSession.userData);
        const nextStepIndex = conditionMet ? step.ifTrue : step.ifFalse;
        
        if (nextStepIndex >= 0 && nextStepIndex < userSession.flow.steps.length) {
          await this.executeCustomCommandStep(ctx, metaBotInfo, user, sessionKey, nextStepIndex);
        } else {
          userSession.currentStepIndex = nextStepIndex;
        }
        break;
        
      default:
        console.log(`Unknown step type: ${step.type}`);
        userSession.currentStepIndex++;
    }
    
    this.customCommandSessions.set(sessionKey, userSession);
  };

  // NEW: Handle custom command callbacks (for multiple choice, etc.)
  handleCustomCommandCallbacks = async (ctx) => {
    try {
      const callbackData = ctx.update.callback_query.data;
      
      if (callbackData.startsWith('custom_choice_')) {
        const parts = callbackData.split('_');
        const sessionKey = `${parts[2]}_${parts[3]}`;
        const stepIndex = parseInt(parts[4]);
        const choiceValue = parts[5];
        
        const userSession = this.customCommandSessions.get(sessionKey);
        if (userSession) {
          const currentStep = userSession.flow.steps[stepIndex];
          userSession.userData[currentStep.variable] = choiceValue;
          userSession.currentStepIndex++;
          
          if (userSession.currentStepIndex < userSession.flow.steps.length) {
            await this.executeCustomCommandStep(ctx, ctx.metaBotInfo, ctx.from, sessionKey, userSession.currentStepIndex);
          } else {
            await this.completeCustomCommandFlow(ctx, ctx.metaBotInfo, ctx.from, userSession);
            this.customCommandSessions.delete(sessionKey);
          }
          
          await ctx.answerCbQuery();
        }
      }
    } catch (error) {
      console.error('Custom command callback error:', error);
      await ctx.answerCbQuery('❌ Error processing selection');
    }
  };

  // NEW: Complete custom command flow
  completeCustomCommandFlow = async (ctx, metaBotInfo, user, userSession) => {
    if (userSession.flow.completion_message) {
      const completionMessage = this.replaceVariables(userSession.flow.completion_message, userSession.userData);
      await ctx.replyWithMarkdown(completionMessage);
    }
    
    // Log the completed flow
    console.log(`✅ Custom command flow completed for user ${user.id} in bot ${metaBotInfo.botName}`);
    
    // Notify admins about completed flow (optional)
    await this.notifyAdminsAboutCustomFlow(metaBotInfo.mainBotId, user, userSession);
  };

  // NEW: Helper to replace variables in messages
  replaceVariables = (text, userData) => {
    let result = text;
    for (const [key, value] of Object.entries(userData)) {
      result = result.replace(new RegExp(`{${key}}`, 'g'), value);
    }
    return result;
  };

  // NEW: Evaluate conditions
  evaluateCondition = (condition, userData) => {
    // Simple condition evaluation - can be extended
    const value = userData[condition.variable];
    switch (condition.operator) {
      case 'equals': return value === condition.value;
      case 'not_equals': return value !== condition.value;
      case 'contains': return value && value.includes(condition.value);
      default: return false;
    }
  };

  // NEW: Notify admins about custom flow completion
  notifyAdminsAboutCustomFlow = async (botId, user, userSession) => {
    try {
      const admins = await Admin.findAll({
        where: { bot_id: botId },
        include: [{ model: User, as: 'User' }]
      });
      
      const bot = await Bot.findByPk(botId);
      const botInstance = this.getBotInstanceByDbId(botId);
      
      if (!botInstance) return;
      
      const notificationMessage = `📊 *Custom Flow Completed*\n\n` +
        `*User:* ${user.first_name}${user.username ? ` (@${user.username})` : ''}\n` +
        `*Flow:* ${userSession.flow.name || 'Custom Flow'}\n` +
        `*Completed:* ${new Date().toLocaleString()}\n` +
        `*Data Collected:* ${Object.keys(userSession.userData).length} fields`;
      
      for (const admin of admins) {
        if (admin.User) {
          try {
            await botInstance.telegram.sendMessage(admin.User.telegram_id, notificationMessage, {
              parse_mode: 'Markdown'
            });
          } catch (error) {
            console.error(`Failed to notify admin ${admin.User.username}:`, error.message);
          }
        }
      }
      
      // Notify owner if not in admin list
      const owner = await User.findOne({ where: { telegram_id: bot.owner_id } });
      if (owner && !admins.find(a => a.admin_user_id === owner.telegram_id)) {
        try {
          await botInstance.telegram.sendMessage(owner.telegram_id, notificationMessage, {
            parse_mode: 'Markdown'
          });
        } catch (error) {
          console.error('Failed to notify owner:', error.message);
        }
      }
    } catch (error) {
      console.error('Custom flow notification error:', error);
    }
  };

// FIXED: Start handler with proper error handling and bot validation
handleStart = async (ctx) => {
  try {
    const { metaBotInfo } = ctx;
    
    // CRITICAL FIX: Validate metaBotInfo exists
    if (!metaBotInfo) {
      console.error('❌ metaBotInfo is undefined in start handler');
      return await ctx.reply('🤖 Welcome! This bot is being configured. Please try again later.');
    }

    const user = ctx.from;
    
    console.log(`🚀 Start command received for ${metaBotInfo.botName} (Type: ${metaBotInfo.botRecord.bot_type}) from ${user.first_name}`);
    
    // Set bot commands for menu
    await this.setBotCommands(ctx.telegram, null, user.id);
    
    // CRITICAL FIX: Safe user logging with validation
    try {
      // First, verify the bot exists in database
      const botExists = await Bot.findByPk(metaBotInfo.mainBotId);
      if (!botExists) {
        console.error(`❌ Bot with ID ${metaBotInfo.mainBotId} not found in database, skipping user log`);
        console.error(`   Bot Name: ${metaBotInfo.botName}, Username: ${metaBotInfo.botUsername}`);
        
        // Continue with welcome message but don't crash
      } else {
        // Bot exists, safe to log user interaction
        await UserLog.upsert({
          bot_id: metaBotInfo.mainBotId,
          user_id: user.id,
          user_username: user.username,
          user_first_name: user.first_name,
          last_interaction: new Date(),
          first_interaction: new Date(),
          interaction_count: 1
        });
        console.log(`✅ User log created for ${user.first_name} in bot ${metaBotInfo.botName}`);
      }
    } catch (dbError) {
      // Handle specific foreign key constraint errors
      if (dbError.name === 'SequelizeForeignKeyConstraintError') {
        console.error(`🔧 Foreign key violation for bot ${metaBotInfo.mainBotId}:`, dbError.message);
        console.error(`   This means bot ID ${metaBotInfo.mainBotId} doesn't exist in bots table`);
        // Continue execution - don't crash the bot
      } else {
        console.error('❌ Database error during user logging:', dbError.message);
        // Continue execution - non-critical error
      }
    }
    
    const isAdmin = await this.checkAdminAccess(metaBotInfo.mainBotId, user.id);
    
    if (isAdmin) {
      await this.showAdminDashboard(ctx, metaBotInfo);
    } else {
      // Handle user welcome based on bot type
      if (metaBotInfo.botRecord.bot_type === 'custom') {
        await this.showCustomBotWelcome(ctx, metaBotInfo, user);
      } else {
        await this.showQuickBotWelcome(ctx, metaBotInfo);
      }
    }
    
  } catch (error) {
    console.error('💥 Start handler error:', error);
    
    // Enhanced error handling with user-friendly messages
    if (error.name === 'SequelizeForeignKeyConstraintError') {
      console.error('🔧 Foreign key constraint violation - bot may have been deleted');
      await ctx.reply('🤖 Welcome! This bot is currently being updated. Please try again in a moment.');
    } else {
      await ctx.reply('👋 Welcome! There was a temporary issue. Please try again.');
    }
  }
};
  // NEW: Enhanced user welcome that handles both quick and custom bots
  showUserWelcome = async (ctx, metaBotInfo) => {
    try {
      const user = ctx.from;
      const botRecord = metaBotInfo.botRecord;
      
      console.log(`🎯 Showing welcome for ${botRecord.bot_type} bot: ${botRecord.bot_name}`);
      
      // Handle custom bots with custom flows
      if (botRecord.bot_type === 'custom' && botRecord.custom_flow_data) {
        await this.handleCustomBotWelcome(ctx, botRecord, user);
      } else {
        // Default quick bot welcome
        await this.handleQuickBotWelcome(ctx, botRecord, user);
      }
    } catch (error) {
      console.error('Welcome message error:', error);
      // Fallback to basic welcome
      await ctx.reply(
        `👋 Hello ${ctx.from.first_name}! Welcome to ${metaBotInfo.botName}. ` +
        `How can I help you today?`
      );
    }
  };

  // Handle custom bot welcome with flow logic
  handleCustomBotWelcome = async (ctx, botRecord, user) => {
    try {
      console.log(`🛠️ Starting custom flow for bot: ${botRecord.bot_name}`);
      
      // Initialize custom command engine if not already done
      if (!this.customCommandEngines.has(botRecord.id)) {
        this.customCommandEngines.set(botRecord.id, new CustomCommandEngine());
      }
      
      const engine = this.customCommandEngines.get(botRecord.id);
      
      // Load custom flow data
      if (botRecord.custom_flow_data) {
        const flowResult = await engine.executeWelcomeFlow(botRecord.custom_flow_data, ctx);
        
        if (flowResult.success) {
          console.log(`✅ Custom flow executed successfully for ${botRecord.bot_name}`);
          return;
        }
      }
      
      // Fallback if custom flow fails
      await this.handleQuickBotWelcome(ctx, botRecord, user);
      
    } catch (error) {
      console.error('Custom bot welcome error:', error);
      await this.handleQuickBotWelcome(ctx, botRecord, user);
    }
  };

  // Handle quick bot welcome (original logic)
  handleQuickBotWelcome = async (ctx, botRecord, user) => {
    const welcomeMessage = botRecord.welcome_message || 
      "👋 Hello! I'm here to help you get in touch with the admin. Just send me a message!";
    
    await ctx.reply(
      `👋 Hello ${user.first_name}!\n\n${welcomeMessage}`,
      Markup.removeKeyboard()
    );
  };

  // ... (rest of your existing methods remain the same)
  // All your other methods (handleUserMessage, showAdminDashboard, etc.) stay as they are

  handleUserMessage = async (ctx, metaBotInfo, user, message) => {
    try {
      // CRITICAL FIX: Validate bot exists before logging
      const botExists = await Bot.findByPk(metaBotInfo.mainBotId);
      if (!botExists) {
        console.error(`❌ Bot ${metaBotInfo.mainBotId} not found, cannot log user message`);
        await ctx.reply('❌ Bot configuration error. Please contact administrator.');
        return;
      }

      await UserLog.upsert({
        bot_id: metaBotInfo.mainBotId,
        user_id: user.id,
        user_username: user.username,
        user_first_name: user.first_name,
        last_interaction: new Date()
      });
      
      const feedback = await Feedback.create({
        bot_id: metaBotInfo.mainBotId,
        user_id: user.id,
        user_username: user.username,
        user_first_name: user.first_name,
        message: message,
        message_id: ctx.message.message_id,
        message_type: 'text'
      });
      
      await this.notifyAdminsRealTime(metaBotInfo.mainBotId, feedback, user, 'text', ctx.message);
      
      const successMsg = await ctx.reply('✅ Your message has been received.');
      await this.deleteAfterDelay(ctx, successMsg.message_id, 5000);
      
      console.log(`📨 New message from ${user.first_name} to ${metaBotInfo.botName}`);
      
    } catch (error) {
      console.error('User message handler error:', error);
      // Enhanced error handling for foreign key constraints
      if (error.name === 'SequelizeForeignKeyConstraintError') {
        await ctx.reply('❌ Bot configuration error. Please contact administrator.');
      } else {
        await ctx.reply('❌ Sorry, there was an error sending your message. Please try again.');
      }
    }
  };

  // ... (all your other existing methods continue below exactly as they are)

  showAdminDashboard = async (ctx, metaBotInfo) => {
    try {
      const stats = await this.getQuickStats(metaBotInfo.mainBotId);
      
      const dashboardMessage = `🤖 *Admin Dashboard - ${metaBotInfo.botName}*\n\n` +
        `*Quick Stats:*\n` +
        `📨 ${stats.pendingMessages} pending messages\n` +
        `👥 ${stats.totalUsers} total users\n` +
        `💬 ${stats.totalMessages} total messages\n\n` +
        `*Quick Access:*\n` +
        `• Use commands from menu (/) button\n` +
        `• Or click buttons below`;
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📢 Send Broadcast', 'mini_broadcast')],
        [Markup.button.callback('📊 Statistics', 'mini_stats')],
        [Markup.button.callback('👥 Manage Admins', 'mini_admins')],
        [Markup.button.callback('⚙️ Bot Settings', 'mini_settings')],
        [Markup.button.url('🚀 Create More Bots', 'https://t.me/MarCreatorBot')]
      ]);
      
      if (ctx.updateType === 'callback_query') {
        await ctx.editMessageText(dashboardMessage, {
          parse_mode: 'Markdown',
          ...keyboard
        });
      } else {
        await ctx.replyWithMarkdown(dashboardMessage, keyboard);
      }
    } catch (error) {
      console.error('Admin dashboard error:', error);
      await ctx.reply('❌ Error loading dashboard.');
    }
  };


  // UPDATED: Use your current default welcome message format
  getWelcomeMessage = async (botId) => {
    try {
      const bot = await Bot.findByPk(botId);
      let welcomeMessage = bot?.welcome_message;
      
      // If no custom message, use the current default format
      if (!welcomeMessage) {
        return `👋 Welcome to *{botName}*!\n\n` +
          `We are here to assist you with any questions or concerns you may have.\n\n` +
          `Simply send us a message, and we'll respond as quickly as possible!\n\n` +
          `_This Bot is created by @MarCreatorBot_`;
      }
      
      // For custom messages, append the creator credit if it's not already there
      const creatorCredit = "_This Bot is created by @MarCreatorBot_";
      if (!welcomeMessage.includes('@MarCreatorBot') && !welcomeMessage.includes('MarCreatorBot')) {
        welcomeMessage += `\n\n${creatorCredit}`;
      }
      
      return welcomeMessage;
    } catch (error) {
      console.error('Error getting welcome message:', error);
      return `👋 Welcome to *{botName}*!\n\n` +
        `We are here to assist you with any questions or concerns you may have.\n\n` +
        `Simply send us a message, and we'll respond as quickly as possible!\n\n` +
        `_This Bot is created by @MarCreatorBot_`;
    }
  };

  handleDashboard = async (ctx) => {
    try {
      const { metaBotInfo } = ctx;
      const isAdmin = await this.checkAdminAccess(metaBotInfo.mainBotId, ctx.from.id);
      
      if (isAdmin) {
        await this.showAdminDashboard(ctx, metaBotInfo);
      } else {
        await ctx.reply('❌ Admin access required. Use /start for user features.');
      }
    } catch (error) {
      console.error('Dashboard error:', error);
      await ctx.reply('❌ Error loading dashboard.');
    }
  };

  handleSettingsCommand = async (ctx) => {
    try {
      const { metaBotInfo } = ctx;
      const isOwner = await this.checkOwnerAccess(metaBotInfo.mainBotId, ctx.from.id);
      
      if (!isOwner) {
        await ctx.reply('❌ Only bot owner can change settings.');
        return;
      }
      
      await this.showSettings(ctx, metaBotInfo.mainBotId);
    } catch (error) {
      console.error('Settings command error:', error);
      await ctx.reply('❌ Error loading settings.');
    }
  };

  showSettings = async (ctx, botId) => {
    try {
      const bot = await Bot.findByPk(botId);
      const currentWelcomeMessage = bot.welcome_message || `👋 Welcome to *${bot.bot_name}*!\n\nWe are here to assist you with any questions or concerns you may have.\n\nSimply send us a message, and we'll respond as quickly as possible!\n\n_This Bot is created by @MarCreatorBot_`;
      
      const settingsMessage = `⚙️ *Bot Settings - ${bot.bot_name}*\n\n` +
        `*Current Welcome Message:*\n` +
        `${currentWelcomeMessage.substring(0, 100)}${currentWelcomeMessage.length > 100 ? '...' : ''}\n\n` +
        `*Available Settings:*`;
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✏️ Change Welcome Message', 'settings_welcome')],
        [Markup.button.callback('🔄 Reset Welcome Message', 'settings_reset_welcome')],
        [Markup.button.callback('🔙 Dashboard', 'mini_dashboard')]
      ]);
      
      if (ctx.updateType === 'callback_query') {
        await ctx.editMessageText(settingsMessage, {
          parse_mode: 'Markdown',
          ...keyboard
        });
      } else {
        await ctx.replyWithMarkdown(settingsMessage, keyboard);
      }
    } catch (error) {
      console.error('Show settings error:', error);
      await ctx.reply('❌ Error loading settings.');
    }
  };

  handleBroadcastCommand = async (ctx) => {
    try {
      const { metaBotInfo } = ctx;
      const isAdmin = await this.checkAdminAccess(metaBotInfo.mainBotId, ctx.from.id);
      
      if (!isAdmin) {
        await ctx.reply('❌ Admin access required.');
        return;
      }
      
      await this.startBroadcast(ctx, metaBotInfo.mainBotId);
    } catch (error) {
      console.error('Broadcast command error:', error);
      await ctx.reply('❌ Error starting broadcast.');
    }
  };

  handleStatsCommand = async (ctx) => {
    try {
      const { metaBotInfo } = ctx;
      await this.showStats(ctx, metaBotInfo.mainBotId);
    } catch (error) {
      console.error('Stats command error:', error);
      await ctx.reply('❌ Error loading statistics.');
    }
  };

  handleAdminsCommand = async (ctx) => {
    try {
      const { metaBotInfo } = ctx;
      const isOwner = await this.checkOwnerAccess(metaBotInfo.mainBotId, ctx.from.id);
      
      if (!isOwner) {
        await ctx.reply('❌ Only bot owner can manage admins.');
        return;
      }
      
      await this.showAdmins(ctx, metaBotInfo.mainBotId);
    } catch (error) {
      console.error('Admins command error:', error);
      await ctx.reply('❌ Error loading admins.');
    }
  };

  handleHelp = async (ctx) => {
    try {
      const { metaBotInfo } = ctx;
      const isAdmin = await this.checkAdminAccess(metaBotInfo.mainBotId, ctx.from.id);
      
      let helpMessage;
      
      if (isAdmin) {
        helpMessage = `🤖 *Admin Help & Support*\n\n` +
          `*Available Commands:*\n` +
          `/dashboard - 📊 Admin dashboard with quick stats\n` +
          `/broadcast - 📢 Send message to all users\n` +
          `/stats - 📈 View bot statistics\n` +
          `/admins - 👥 Manage admin team (owners only)\n` +
          `/settings - ⚙️ Bot settings (owners only)\n` +
          `/help - ❓ This help message\n\n` +
          `*Quick Tips:*\n` +
          `• Click notification buttons to reply instantly\n` +
          `• Use broadcast for important announcements\n` +
          `• Add co-admins to help manage messages\n` +
          `• You can send images, videos, and files as admin\n\n` +
          `*Need help?* Contact @MarCreatorSupportBot`;
      } else {
        helpMessage = `🤖 *Help & Support*\n\n` +
          `*How to use this bot:*\n` +
          `• Send any message to contact our team\n` +
          `• Send images, videos, files, or voice messages\n` +
          `• We'll respond as quickly as possible\n` +
          `• You'll get notifications when we reply\n\n` +
          `*Available Commands:*\n` +
          `/start - 🚀 Start the bot\n` +
          `/help - ❓ Get help\n\n` +
          `*We're here to help! 🤝*\n`;
      }
      
      await ctx.replyWithMarkdown(helpMessage);
      
    } catch (error) {
      console.error('Help command error:', error);
      await ctx.reply('Use /start to begin.');
    }
  };

  // Keep all other existing utility methods
  getBotInstanceByDbId = (dbId) => {
    const botData = this.activeBots.get(parseInt(dbId));
    if (!botData) {
      console.error(`❌ Bot instance not found for DB ID: ${dbId}`);
      console.error(`📊 Available bot IDs:`, Array.from(this.activeBots.keys()));
      return null;
    }
    return botData.instance;
  };

  debugActiveBots = () => {
    console.log('\n🐛 DEBUG: Active Bots Status');
    console.log(`📊 Total active bots: ${this.activeBots.size}`);
    console.log(`🏁 Initialization status: ${this.isInitialized ? 'COMPLETE' : 'PENDING'}`);
    console.log(`🔄 Initialization attempts: ${this.initializationAttempts}`);
    
    if (this.activeBots.size === 0) {
      console.log('❌ No active bots found in memory!');
    } else {
      for (const [dbId, botData] of this.activeBots.entries()) {
        console.log(`🤖 Bot: ${botData.record.bot_name} | DB ID: ${dbId} | Type: ${botData.record.bot_type} | Status: ${botData.status} | Launched: ${botData.launchedAt.toISOString()}`);
      }
    }
  };

  async forceReinitializeAllBots() {
    console.log('🔄 FORCE: Reinitializing all mini-bots...');
    this.initializationAttempts = 0;
    this.isInitialized = false;
    return await this.initializeAllBots();
  }

  getInitializationStatus() {
    return {
      isInitialized: this.isInitialized,
      activeBots: this.activeBots.size,
      attempts: this.initializationAttempts,
      maxAttempts: this.maxInitializationAttempts,
      status: this.isInitialized ? 'READY' : 'INITIALIZING'
    };
  }

  getMediaTypeEmoji = (messageType) => {
    const emojiMap = {
      'text': '💬',
      'image': '🖼️',
      'video': '🎥',
      'document': '📎',
      'media_group': '🖼️',
      'audio': '🎵',
      'voice': '🎤',
      'sticker': '🤡'
    };
    return emojiMap[messageType] || '📄';
  };

  startReply = async (ctx, feedbackId) => {
    try {
      const feedback = await Feedback.findByPk(feedbackId);
      if (!feedback) {
        await ctx.reply('❌ Message not found');
        return;
      }
      
      this.replySessions.set(ctx.from.id, {
        feedbackId: feedbackId,
        userId: feedback.user_id,
        step: 'awaiting_reply'
      });
      
      await ctx.reply(
        `💬 *Replying to ${feedback.user_first_name}*\n\n` +
        `Please type your reply message:\n\n` +
        `*Cancel:* Type /cancel`,
        { parse_mode: 'Markdown' }
      );
      
    } catch (error) {
      console.error('Start reply error:', error);
      await ctx.reply('❌ Error starting reply');
    }
  };

  sendReply = async (ctx, feedbackId, userId, replyText) => {
    try {
      console.log(`💬 Attempting to send reply for feedback ID: ${feedbackId}`);
      
      const feedback = await Feedback.findByPk(feedbackId);
      if (!feedback) {
        await ctx.reply('❌ Message not found.');
        return;
      }

      console.log(`🔍 Feedback found, bot_id: ${feedback.bot_id}`);
      
      const botInstance = this.getBotInstanceByDbId(feedback.bot_id);
      
      if (!botInstance) {
        console.error('❌ Bot instance not found for reply');
        this.debugActiveBots();
        await ctx.reply('❌ Bot not active. Please restart the main bot to activate all mini-bots.');
        return;
      }
      
      console.log(`✅ Bot instance found, sending reply to user: ${userId}`);
      
      await botInstance.telegram.sendMessage(
        userId,
        `💬 *Reply from admin:*\n\n${replyText}\n\n` +
        `_This is a reply to your message_`,
        { parse_mode: 'Markdown' }
      );
      
      await feedback.update({
        is_replied: true,
        reply_message: replyText,
        replied_by: ctx.from.id,
        replied_at: new Date()
      });
      
      const successMsg = await ctx.reply('✅ Reply sent successfully!');
      await this.deleteAfterDelay(ctx, successMsg.message_id, 5000);
      
    } catch (error) {
      console.error('Send reply error:', error);
      await ctx.reply('❌ Error sending reply. User might have blocked the bot.');
    }
  };

  startBroadcast = async (ctx, botId) => {
    try {
      const userCount = await UserLog.count({ where: { bot_id: botId } });
      
      if (userCount === 0) {
        await ctx.reply('❌ No users found for broadcasting.');
        return;
      }
      
      this.broadcastSessions.set(ctx.from.id, {
        botId: botId,
        step: 'awaiting_message'
      });
      
      await ctx.reply(
        `📢 *Send Broadcast*\n\n` +
        `*Recipients:* ${userCount} users\n\n` +
        `Please type your broadcast message:\n\n` +
        `*Cancel:* Type /cancel`,
        { parse_mode: 'Markdown' }
      );
      
    } catch (error) {
      console.error('Start broadcast error:', error);
      await ctx.reply('❌ Error starting broadcast.');
    }
  };

  sendBroadcast = async (ctx, botId, message) => {
    try {
      console.log(`📢 Starting broadcast for bot ID: ${botId}`);
      
      const users = await UserLog.findAll({ 
        where: { bot_id: botId },
        attributes: ['user_id']
      });
      
      console.log(`📊 Broadcasting to ${users.length} users`);
      
      let successCount = 0;
      let failCount = 0;
      
      const progressMsg = await ctx.reply(`🔄 Sending broadcast to ${users.length} users...\n✅ Sent: 0\n❌ Failed: 0`);
      
      const botInstance = this.getBotInstanceByDbId(botId);
      
      if (!botInstance) {
        console.error('❌ Bot instance not found for broadcast');
        this.debugActiveBots();
        await ctx.reply('❌ Bot not active. Please restart the main bot to activate all mini-bots.');
        return;
      }
      
      console.log(`✅ Bot instance found, starting broadcast...`);
      
      const escapeMarkdown = (text) => {
        return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
      };
      
      const safeMessage = escapeMarkdown(message);
      
      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        try {
          await botInstance.telegram.sendMessage(user.user_id, safeMessage, {
            parse_mode: 'MarkdownV2'
          });
          successCount++;
          
          if (i % 10 === 0) {
            await ctx.telegram.editMessageText(
              ctx.chat.id,
              progressMsg.message_id,
              null,
              `🔄 Sending broadcast to ${users.length} users...\n✅ Sent: ${successCount}\n❌ Failed: ${failCount}`
            );
          }
          
          if (i % 30 === 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (error) {
          failCount++;
          console.error(`Failed to send to user ${user.user_id}:`, error.message);
          
          if (error.message.includes('parse entities')) {
            try {
              await botInstance.telegram.sendMessage(user.user_id, message, {
                parse_mode: 'HTML'
              });
              successCount++;
              failCount--;
              console.log(`✅ Successfully sent to user ${user.user_id} using HTML format`);
            } catch (htmlError) {
              console.error(`HTML format also failed for user ${user.user_id}:`, htmlError.message);
              
              try {
                await botInstance.telegram.sendMessage(user.user_id, message);
                successCount++;
                failCount--;
                console.log(`✅ Successfully sent to user ${user.user_id} as plain text`);
              } catch (plainError) {
                console.error(`Plain text also failed for user ${user.user_id}:`, plainError.message);
              }
            }
          }
        }
      }
      
      await BroadcastHistory.create({
        bot_id: botId,
        sent_by: ctx.from.id,
        message: message,
        total_users: users.length,
        successful_sends: successCount,
        failed_sends: failCount
      });
      
      const successRate = ((successCount / users.length) * 100).toFixed(1);
      
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        progressMsg.message_id,
        null,
        `✅ *Broadcast Completed!*\n\n` +
        `*Recipients:* ${users.length}\n` +
        `*✅ Successful:* ${successCount}\n` +
        `*❌ Failed:* ${failCount}\n` +
        `*📊 Success Rate:* ${successRate}%`,
        { parse_mode: 'Markdown' }
      );
      
    } catch (error) {
      console.error('Send broadcast error:', error);
      await ctx.reply('❌ Error sending broadcast: ' + error.message);
    }
  };

  showStats = async (ctx, botId) => {
    try {
      const userCount = await UserLog.count({ where: { bot_id: botId } });
      const messageCount = await Feedback.count({ where: { bot_id: botId } });
      const pendingCount = await Feedback.count({ 
        where: { bot_id: botId, is_replied: false } 
      });
      
      const messageTypes = await Feedback.findAll({
        where: { bot_id: botId },
        attributes: ['message_type', [Feedback.sequelize.fn('COUNT', Feedback.sequelize.col('id')), 'count']],
        group: ['message_type']
      });
      
      let typeBreakdown = '';
      messageTypes.forEach(type => {
        typeBreakdown += `• ${this.getMediaTypeEmoji(type.message_type)} ${type.message_type}: ${type.dataValues.count}\n`;
      });
      
      const statsMessage = `📊 *Bot Statistics*\n\n` +
        `👥 Total Users: ${userCount}\n` +
        `💬 Total Messages: ${messageCount}\n` +
        `📨 Pending Replies: ${pendingCount}\n` +
        `🔄 Status: ✅ Active\n\n` +
        `*Message Types:*\n${typeBreakdown}`;
      
      await ctx.replyWithMarkdown(statsMessage);
      
    } catch (error) {
      console.error('Show stats error:', error);
      await ctx.reply('❌ Error loading statistics.');
    }
  };

  showAdmins = async (ctx, botId) => {
    try {
      const admins = await Admin.findAll({
        where: { bot_id: botId },
        include: [{ model: User, as: 'User' }]
      });
      
      const bot = await Bot.findByPk(botId);
      
      let message = `👥 *Admin Management*\n\n` +
        `*Total Admins:* ${admins.length}\n\n` +
        `*Current Admins:*\n`;
      
      admins.forEach((admin, index) => {
        const userInfo = admin.User ? 
          `@${admin.User.username} (${admin.User.first_name})` : 
          `User#${admin.admin_user_id}`;
        
        const isOwner = admin.admin_user_id === bot.owner_id;
        
        message += `*${index + 1}.* ${userInfo} ${isOwner ? '👑 (Owner)' : ''}\n`;
      });
      
      const keyboardButtons = [];
      
      admins.filter(admin => admin.admin_user_id !== bot.owner_id).forEach(admin => {
        keyboardButtons.push([
          Markup.button.callback(
            `➖ Remove ${admin.User?.username || `User#${admin.admin_user_id}`}`,
            `remove_admin_${admin.id}`
          )
        ]);
      });
      
      keyboardButtons.push(
        [Markup.button.callback('➕ Add Admin', 'admin_add')],
        [Markup.button.callback('🔙 Dashboard', 'mini_dashboard')]
      );
      
      const keyboard = Markup.inlineKeyboard(keyboardButtons);
      
      if (ctx.updateType === 'callback_query') {
        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          ...keyboard
        });
      } else {
        await ctx.replyWithMarkdown(message, keyboard);
      }
      
    } catch (error) {
      console.error('Show admins error:', error);
      await ctx.reply('❌ Error loading admins.');
    }
  };

  removeAdmin = async (ctx, botId, adminId) => {
    try {
      const admin = await Admin.findByPk(adminId);
      
      if (!admin) {
        await ctx.reply('❌ Admin not found.');
        return;
      }
      
      const bot = await Bot.findByPk(botId);
      
      if (admin.admin_user_id === bot.owner_id) {
        await ctx.reply('❌ Cannot remove bot owner.');
        return;
      }
      
      const adminUsername = admin.admin_username || `User#${admin.admin_user_id}`;
      
      await admin.destroy();
      
      const successMsg = await ctx.reply(`✅ Admin ${adminUsername} has been removed successfully.`);
      await this.deleteAfterDelay(ctx, successMsg.message_id, 5000);
      
      await this.showAdmins(ctx, botId);
      
    } catch (error) {
      console.error('Remove admin error:', error);
      await ctx.reply('❌ Error removing admin.');
    }
  };

  startAddAdmin = async (ctx, botId) => {
    try {
      this.adminSessions.set(ctx.from.id, {
        botId: botId,
        step: 'awaiting_admin_input'
      });
      
      await ctx.reply(
        `👥 *Add New Admin*\n\n` +
        `Please send the new admin's Telegram *User ID* or *Username*:\n\n` +
        `*Cancel:* Type /cancel`,
        { parse_mode: 'Markdown' }
      );
      
    } catch (error) {
      console.error('Start add admin error:', error);
      await ctx.reply('❌ Error adding admin');
    }
  };

  processAddAdmin = async (ctx, botId, input) => {
    try {
      let targetUserId;
      
      if (/^\d+$/.test(input)) {
        targetUserId = parseInt(input);
      } else {
        const username = input.replace('@', '');
        const user = await User.findOne({ where: { username: username } });
        if (!user) {
          await ctx.reply(`❌ User @${username} not found. Ask them to start @MarCreatorBot first.`);
          return;
        }
        targetUserId = user.telegram_id;
      }
      
      const existingAdmin = await Admin.findOne({
        where: { bot_id: botId, admin_user_id: targetUserId }
      });
      
      if (existingAdmin) {
        await ctx.reply('❌ This user is already an admin.');
        return;
      }
      
      const targetUser = await User.findOne({ where: { telegram_id: targetUserId } });
      if (!targetUser) {
        await ctx.reply('❌ User not found. Ask them to start @MarCreatorBot first.');
        return;
      }
      
      await Admin.create({
        bot_id: botId,
        admin_user_id: targetUserId,
        admin_username: targetUser.username,
        added_by: ctx.from.id,
        permissions: {
          can_reply: true,
          can_broadcast: true,
          can_manage_admins: false,
          can_view_stats: true,
          can_deactivate: false
        }
      });
      
      const userDisplay = targetUser.username ? `@${targetUser.username}` : `User#${targetUserId}`;
      
      const successMsg = await ctx.reply(
        `✅ *${userDisplay} added as admin!*\n\n` +
        `They can now reply to messages and send broadcasts.`,
        { parse_mode: 'Markdown' }
      );
      
      await this.deleteAfterDelay(ctx, successMsg.message_id, 5000);
      
    } catch (error) {
      console.error('Process add admin error:', error);
      await ctx.reply('❌ Error adding admin.');
    }
  };

  showAbout = async (ctx, metaBotInfo) => {
    try {
      const aboutMessage = `ℹ️ *About ${metaBotInfo.botName}*\n\n` +
        `*Bot Username:* @${metaBotInfo.botUsername}\n` +
        `*Created via:* @MarCreatorBot\n\n` +
        `*Create your own bot:* @MarCreatorBot`;
      
      await ctx.replyWithMarkdown(aboutMessage);
    } catch (error) {
      console.error('About error:', error);
      await ctx.reply(`About ${metaBotInfo.botName}`);
    }
  };

  notifyAdminsRealTime = async (botId, feedback, user, messageType = 'text', originalMessage = null) => {
    try {
      console.log(`🔔 Sending real-time notification for bot ID: ${botId}, type: ${messageType}`);
      
      const admins = await Admin.findAll({
        where: { bot_id: botId },
        include: [{ model: User, as: 'User' }]
      });
      
      const bot = await Bot.findByPk(botId);
      
      const botInstance = this.getBotInstanceByDbId(botId);
      
      if (!botInstance) {
        console.error('❌ Bot instance not found for real-time notification');
        this.debugActiveBots();
        return;
      }
      
      const mediaEmoji = this.getMediaTypeEmoji(messageType);
      const mediaTypeText = messageType === 'text' ? 'Message' : messageType.charAt(0).toUpperCase() + messageType.slice(1);
      
      for (const admin of admins) {
        if (admin.User) {
          try {
            if (messageType === 'image' && originalMessage && originalMessage.photo) {
              await botInstance.telegram.sendPhoto(
                admin.User.telegram_id,
                originalMessage.photo[originalMessage.photo.length - 1].file_id,
                {
                  caption: `🔔 *New Image from ${user.first_name}${user.username ? ` (@${user.username})` : ''}*\n\n` +
                           `💬 ${originalMessage.caption || '[No caption]'}`,
                  parse_mode: 'Markdown',
                  ...Markup.inlineKeyboard([
                    [Markup.button.callback('📩 Reply Now', `reply_${feedback.id}`)]
                  ])
                }
              );
            } else if (messageType === 'video' && originalMessage && originalMessage.video) {
              await botInstance.telegram.sendVideo(
                admin.User.telegram_id,
                originalMessage.video.file_id,
                {
                  caption: `🔔 *New Video from ${user.first_name}${user.username ? ` (@${user.username})` : ''}*\n\n` +
                           `💬 ${originalMessage.caption || '[No caption]'}`,
                  parse_mode: 'Markdown',
                  ...Markup.inlineKeyboard([
                    [Markup.button.callback('📩 Reply Now', `reply_${feedback.id}`)]
                  ])
                }
              );
            } else if (messageType === 'document' && originalMessage && originalMessage.document) {
              await botInstance.telegram.sendDocument(
                admin.User.telegram_id,
                originalMessage.document.file_id,
                {
                  caption: `🔔 *New File from ${user.first_name}${user.username ? ` (@${user.username})` : ''}*\n\n` +
                           `💬 ${originalMessage.caption || '[No caption]'}`,
                  parse_mode: 'Markdown',
                  ...Markup.inlineKeyboard([
                    [Markup.button.callback('📩 Reply Now', `reply_${feedback.id}`)]
                  ])
                }
              );
            } else if (messageType === 'audio' && originalMessage && originalMessage.audio) {
              await botInstance.telegram.sendAudio(
                admin.User.telegram_id,
                originalMessage.audio.file_id,
                {
                  caption: `🔔 *New Audio from ${user.first_name}${user.username ? ` (@${user.username})` : ''}*\n\n` +
                           `💬 ${originalMessage.caption || '[No caption]'}`,
                  parse_mode: 'Markdown',
                  ...Markup.inlineKeyboard([
                    [Markup.button.callback('📩 Reply Now', `reply_${feedback.id}`)]
                  ])
                }
              );
            } else if (messageType === 'voice' && originalMessage && originalMessage.voice) {
              await botInstance.telegram.sendVoice(
                admin.User.telegram_id,
                originalMessage.voice.file_id,
                {
                  caption: `🔔 *New Voice Message from ${user.first_name}${user.username ? ` (@${user.username})` : ''}*`,
                  parse_mode: 'Markdown',
                  ...Markup.inlineKeyboard([
                    [Markup.button.callback('📩 Reply Now', `reply_${feedback.id}`)]
                  ])
                }
              );
            } else if (messageType === 'media_group' && originalMessage) {
              await botInstance.telegram.sendMessage(
                admin.User.telegram_id,
                `🔔 *Media Album from ${user.first_name}${user.username ? ` (@${user.username})` : ''}*\n\n` +
                `💬 ${originalMessage.caption || '[No caption]'}\n\n` +
                `*This is a media album with multiple files.*`,
                { 
                  parse_mode: 'Markdown',
                  ...Markup.inlineKeyboard([
                    [Markup.button.callback('📩 Reply Now', `reply_${feedback.id}`)]
                  ])
                }
              );
            } else {
              let notificationMessage = `🔔 *New ${mediaTypeText} Received*\n\n` +
                `*From:* ${user.first_name}${user.username ? ` (@${user.username})` : ''}\n`;
              
              if (messageType === 'text') {
                notificationMessage += `*Message:* ${feedback.message}`;
              } else {
                notificationMessage += `*Caption:* ${feedback.media_caption || '[No caption]'}\n` +
                  `*Type:* ${messageType}`;
              }
              
              await botInstance.telegram.sendMessage(admin.User.telegram_id, notificationMessage, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                  [Markup.button.callback('📩 Reply Now', `reply_${feedback.id}`)]
                ])
              });
            }
            
            console.log(`🔔 Media notification sent to admin: ${admin.User.username}`);
          } catch (error) {
            console.error(`Failed to notify admin ${admin.User.username}:`, error.message);
          }
        }
      }
      
      const owner = await User.findOne({ where: { telegram_id: bot.owner_id } });
      if (owner && !admins.find(a => a.admin_user_id === owner.telegram_id)) {
        try {
          if (messageType === 'image' && originalMessage && originalMessage.photo) {
            await botInstance.telegram.sendPhoto(
              owner.telegram_id,
              originalMessage.photo[originalMessage.photo.length - 1].file_id,
              {
                caption: `🔔 *New Image from ${user.first_name}${user.username ? ` (@${user.username})` : ''}*\n\n` +
                         `💬 ${originalMessage.caption || '[No caption]'}`,
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                  [Markup.button.callback('📩 Reply Now', `reply_${feedback.id}`)]
                ])
              }
            );
          } else if (messageType === 'video' && originalMessage && originalMessage.video) {
            await botInstance.telegram.sendVideo(
              owner.telegram_id,
              originalMessage.video.file_id,
              {
                caption: `🔔 *New Video from ${user.first_name}${user.username ? ` (@${user.username})` : ''}*\n\n` +
                         `💬 ${originalMessage.caption || '[No caption]'}`,
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                  [Markup.button.callback('📩 Reply Now', `reply_${feedback.id}`)]
                ])
              }
            );
          } else if (messageType === 'document' && originalMessage && originalMessage.document) {
            await botInstance.telegram.sendDocument(
              owner.telegram_id,
              originalMessage.document.file_id,
              {
                caption: `🔔 *New File from ${user.first_name}${user.username ? ` (@${user.username})` : ''}*\n\n` +
                         `💬 ${originalMessage.caption || '[No caption]'}`,
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                  [Markup.button.callback('📩 Reply Now', `reply_${feedback.id}`)]
                ])
              }
            );
          } else if (messageType === 'audio' && originalMessage && originalMessage.audio) {
            await botInstance.telegram.sendAudio(
              owner.telegram_id,
              originalMessage.audio.file_id,
              {
                caption: `🔔 *New Audio from ${user.first_name}${user.username ? ` (@${user.username})` : ''}*\n\n` +
                         `💬 ${originalMessage.caption || '[No caption]'}`,
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                  [Markup.button.callback('📩 Reply Now', `reply_${feedback.id}`)]
                ])
              }
            );
          } else if (messageType === 'voice' && originalMessage && originalMessage.voice) {
            await botInstance.telegram.sendVoice(
              owner.telegram_id,
              originalMessage.voice.file_id,
              {
                caption: `🔔 *New Voice Message from ${user.first_name}${user.username ? ` (@${user.username})` : ''}*`,
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                  [Markup.button.callback('📩 Reply Now', `reply_${feedback.id}`)]
                ])
              }
            );
          } else {
            let notificationMessage = `🔔 *New ${mediaTypeText} Received*\n\n` +
              `*From:* ${user.first_name}${user.username ? ` (@${user.username})` : ''}\n`;
            
            if (messageType === 'text') {
              notificationMessage += `*Message:* ${feedback.message}`;
            } else {
              notificationMessage += `*Caption:* ${feedback.media_caption || '[No caption]'}\n` +
                `*Type:* ${messageType}`;
            }
            
            await botInstance.telegram.sendMessage(owner.telegram_id, notificationMessage, {
              parse_mode: 'Markdown',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('📩 Reply Now', `reply_${feedback.id}`)]
              ])
            });
          }
          
          console.log(`🔔 Media notification sent to owner: ${owner.username}`);
        } catch (error) {
          console.error('Failed to notify owner:', error.message);
        }
      }
      
      console.log(`🔔 Real-time media notification sent for ${bot.bot_name}`);
      
    } catch (error) {
      console.error('Real-time notification error:', error);
    }
  };

  getQuickStats = async (botId) => {
    try {
      const userCount = await UserLog.count({ where: { bot_id: botId } });
      const messageCount = await Feedback.count({ where: { bot_id: botId } });
      const pendingCount = await Feedback.count({ 
        where: { bot_id: botId, is_replied: false } 
      });
      
      return {
        totalUsers: userCount,
        totalMessages: messageCount,
        pendingMessages: pendingCount
      };
    } catch (error) {
      return { totalUsers: 0, totalMessages: 0, pendingMessages: 0 };
    }
  };

  checkAdminAccess = async (botId, userId) => {
    try {
      const bot = await Bot.findByPk(botId);
      if (bot.owner_id == userId) return true;
      
      const admin = await Admin.findOne({
        where: { bot_id: botId, admin_user_id: userId }
      });
      
      return !!admin;
    } catch (error) {
      return false;
    }
  };

  checkOwnerAccess = async (botId, userId) => {
    try {
      const bot = await Bot.findByPk(botId);
      return bot.owner_id == userId;
    } catch (error) {
      return false;
    }
  };

  stopBot = async (botId) => {
    try {
      const botData = this.activeBots.get(botId);
      if (botData && botData.instance) {
        console.log(`🛑 Stopping bot ${botId}...`);
        await botData.instance.stop();
        this.activeBots.delete(botId);
        console.log(`✅ Bot ${botId} stopped successfully`);
      }
    } catch (error) {
      console.error(`Error stopping bot ${botId}:`, error);
    }
  };

  healthCheck = () => {
    console.log('🏥 Mini-bot Manager Health Check:');
    console.log(`📊 Active bots: ${this.activeBots.size}`);
    console.log(`🏁 Initialized: ${this.isInitialized}`);
    console.log(`🔄 Initialization in progress: ${!!this.initializationPromise}`);
    console.log(`🔄 Initialization attempts: ${this.initializationAttempts}`);
    
    this.debugActiveBots();
    
    return {
      isHealthy: this.isInitialized && !this.initializationPromise,
      activeBots: this.activeBots.size,
      status: this.isInitialized ? 'READY' : 'INITIALIZING',
      attempts: this.initializationAttempts
    };
  };

  // Text message handler and other existing methods
  handleTextMessage = async (ctx) => {
    try {
      const user = ctx.from;
      const message = ctx.message.text;
      const { metaBotInfo } = ctx;
      
      const welcomeSession = this.welcomeMessageSessions.get(user.id);
      if (welcomeSession && welcomeSession.step === 'awaiting_welcome_message') {
        if (message === '/cancel') {
          this.welcomeMessageSessions.delete(user.id);
          await ctx.reply('❌ Welcome message change cancelled.');
          return;
        }
        await this.processWelcomeMessageChange(ctx, welcomeSession.botId, message);
        this.welcomeMessageSessions.delete(user.id);
        return;
      }
      
      const broadcastSession = this.broadcastSessions.get(user.id);
      if (broadcastSession && broadcastSession.step === 'awaiting_message') {
        if (message === '/cancel') {
          this.broadcastSessions.delete(user.id);
          await ctx.reply('❌ Broadcast cancelled.');
          return;
        }
        await this.sendBroadcast(ctx, broadcastSession.botId, message);
        this.broadcastSessions.delete(user.id);
        return;
      }
      
      const replySession = this.replySessions.get(user.id);
      if (replySession && replySession.step === 'awaiting_reply') {
        if (message === '/cancel') {
          this.replySessions.delete(user.id);
          await ctx.reply('❌ Reply cancelled.');
          return;
        }
        await this.sendReply(ctx, replySession.feedbackId, replySession.userId, message);
        this.replySessions.delete(user.id);
        return;
      }
      
      const adminSession = this.adminSessions.get(user.id);
      if (adminSession && adminSession.step === 'awaiting_admin_input') {
        if (message === '/cancel') {
          this.adminSessions.delete(user.id);
          await ctx.reply('❌ Admin addition cancelled.');
          return;
        }
        await this.processAddAdmin(ctx, adminSession.botId, message);
        this.adminSessions.delete(user.id);
        return;
      }
      
      const isAdmin = await this.checkAdminAccess(metaBotInfo.mainBotId, user.id);
      if (isAdmin) {
        await this.showAdminDashboard(ctx, metaBotInfo);
        return;
      }
      
      await this.handleUserMessage(ctx, metaBotInfo, user, message);
      
    } catch (error) {
      console.error('Text message handler error:', error);
      await ctx.reply('❌ An error occurred. Please try again.');
    }
  };

  processWelcomeMessageChange = async (ctx, botId, newMessage) => {
    try {
      const bot = await Bot.findByPk(botId);
      await bot.update({ welcome_message: newMessage });
      
      const successMsg = await ctx.reply('✅ Welcome message updated successfully!');
      await this.deleteAfterDelay(ctx, successMsg.message_id, 5000);
      
      await this.showSettings(ctx, botId);
      
    } catch (error) {
      console.error('Process welcome message change error:', error);
      await ctx.reply('❌ Error updating welcome message.');
    }
  };

  handleMiniAction = async (ctx) => {
    try {
      const action = ctx.match[1];
      const { metaBotInfo } = ctx;
      const user = ctx.from;
      
      await ctx.answerCbQuery();
      
      const isAdmin = await this.checkAdminAccess(metaBotInfo.mainBotId, user.id);
      
      if (!isAdmin && !['about', 'stats'].includes(action)) {
        await ctx.reply('❌ Admin access required.');
        return;
      }
      
      switch (action) {
        case 'dashboard':
          await this.showAdminDashboard(ctx, metaBotInfo);
          break;
        case 'broadcast':
          await this.startBroadcast(ctx, metaBotInfo.mainBotId);
          break;
        case 'stats':
          await this.showStats(ctx, metaBotInfo.mainBotId);
          break;
        case 'admins':
          const isOwner = await this.checkOwnerAccess(metaBotInfo.mainBotId, user.id);
          if (isOwner) {
            await this.showAdmins(ctx, metaBotInfo.mainBotId);
          } else {
            await ctx.reply('❌ Only bot owner can manage admins.');
          }
          break;
        case 'settings':
          const isOwnerForSettings = await this.checkOwnerAccess(metaBotInfo.mainBotId, user.id);
          if (isOwnerForSettings) {
            await this.showSettings(ctx, metaBotInfo.mainBotId);
          } else {
            await ctx.reply('❌ Only bot owner can change settings.');
          }
          break;
        case 'about':
          await this.showAbout(ctx, metaBotInfo);
          break;
        default:
          await ctx.reply('⚠️ Action not available');
      }
    } catch (error) {
      console.error('Mini action error:', error);
      await ctx.reply('❌ Error processing action');
    }
  };

  handleReplyAction = async (ctx) => {
    try {
      const feedbackId = ctx.match[1];
      const { metaBotInfo } = ctx;
      const user = ctx.from;
      
      await ctx.answerCbQuery();
      
      const isAdmin = await this.checkAdminAccess(metaBotInfo.mainBotId, user.id);
      if (!isAdmin) {
        await ctx.reply('❌ Admin access required.');
        return;
      }
      
      await this.startReply(ctx, feedbackId);
    } catch (error) {
      console.error('Reply action error:', error);
      await ctx.reply('❌ Error starting reply');
    }
  };

  handleAdminAction = async (ctx) => {
    try {
      const action = ctx.match[1];
      const { metaBotInfo } = ctx;
      const user = ctx.from;
      
      await ctx.answerCbQuery();
      
      const isOwner = await this.checkOwnerAccess(metaBotInfo.mainBotId, user.id);
      if (!isOwner) {
        await ctx.reply('❌ Only bot owner can manage admins.');
        return;
      }
      
      if (action === 'add') {
        await this.startAddAdmin(ctx, metaBotInfo.mainBotId);
      }
    } catch (error) {
      console.error('Admin action error:', error);
      await ctx.reply('❌ Error processing admin action');
    }
  };

  handleRemoveAdminAction = async (ctx) => {
    try {
      const adminId = ctx.match[1];
      const { metaBotInfo } = ctx;
      const user = ctx.from;
      
      await ctx.answerCbQuery();
      
      const isOwner = await this.checkOwnerAccess(metaBotInfo.mainBotId, user.id);
      if (!isOwner) {
        await ctx.reply('❌ Only bot owner can remove admins.');
        return;
      }
      
      await this.removeAdmin(ctx, metaBotInfo.mainBotId, adminId);
    } catch (error) {
      console.error('Remove admin action error:', error);
      await ctx.reply('❌ Error removing admin');
    }
  };

  handleSettingsAction = async (ctx) => {
    try {
      const action = ctx.match[1];
      const { metaBotInfo } = ctx;
      const user = ctx.from;
      
      await ctx.answerCbQuery();
      
      const isOwner = await this.checkOwnerAccess(metaBotInfo.mainBotId, user.id);
      if (!isOwner) {
        await ctx.reply('❌ Only bot owner can change settings.');
        return;
      }
      
      switch (action) {
        case 'welcome':
          await this.startChangeWelcomeMessage(ctx, metaBotInfo.mainBotId);
          break;
        case 'reset_welcome':
          await this.resetWelcomeMessage(ctx, metaBotInfo.mainBotId);
          break;
        default:
          await ctx.reply('⚠️ Action not available');
      }
    } catch (error) {
      console.error('Settings action error:', error);
      await ctx.reply('❌ Error processing settings action');
    }
  };

  startChangeWelcomeMessage = async (ctx, botId) => {
    try {
      this.welcomeMessageSessions.set(ctx.from.id, {
        botId: botId,
        step: 'awaiting_welcome_message'
      });
      
      const bot = await Bot.findByPk(botId);
      const currentMessage = bot.welcome_message || `👋 Welcome to *${bot.bot_name}*!\n\nWe are here to assist you with any questions or concerns you may have.\n\nSimply send us a message, and we'll respond as quickly as possible!\n\n_This Bot is created by @MarCreatorBot_`;
      
      await ctx.reply(
        `✏️ *Change Welcome Message*\n\n` +
        `*Current Message:*\n${currentMessage}\n\n` +
        `Please send the new welcome message:\n\n` +
        `*Tips:*\n` +
        `• Use {botName} as placeholder for bot name\n` +
        `• Markdown formatting is supported\n` +
        `• Keep it welcoming and informative\n\n` +
        `*Cancel:* Type /cancel`,
        { parse_mode: 'Markdown' }
      );
      
    } catch (error) {
      console.error('Start change welcome message error:', error);
      await ctx.reply('❌ Error starting welcome message change.');
    }
  };

  resetWelcomeMessage = async (ctx, botId) => {
    try {
      const bot = await Bot.findByPk(botId);
      await bot.update({ welcome_message: null });
      
      const successMsg = await ctx.reply('✅ Welcome message reset to default.');
      await this.deleteAfterDelay(ctx, successMsg.message_id, 5000);
      
      await this.showSettings(ctx, botId);
      
    } catch (error) {
      console.error('Reset welcome message error:', error);
      await ctx.reply('❌ Error resetting welcome message.');
    }
  };

  showUserMessages = async (ctx, botId) => {
    try {
      const pendingMessages = await Feedback.findAll({
        where: { bot_id: botId, is_replied: false },
        order: [['created_at', 'DESC']],
        limit: 10
      });
      
      if (pendingMessages.length === 0) {
        await ctx.reply('📭 No pending messages. All caught up! ✅');
        return;
      }
      
      let message = `📨 *User Messages*\n\n` +
        `*Total Pending:* ${pendingMessages.length}\n\n`;
      
      pendingMessages.forEach((feedback, index) => {
        const userInfo = feedback.user_username ? 
          `@${feedback.user_username}` : 
          `User#${feedback.user_id}`;
        
        let preview = feedback.message;
        if (feedback.message_type !== 'text') {
          preview = `[${this.getMediaTypeEmoji(feedback.message_type)} ${feedback.message_type.toUpperCase()}] ${preview}`;
        }
        
        preview = preview.length > 50 ? 
          preview.substring(0, 50) + '...' : 
          preview;
        
        message += `*${index + 1}.* ${userInfo} (${feedback.user_first_name})\n` +
          `💬 ${preview}\n` +
          `🕒 ${feedback.created_at.toLocaleDateString()}\n\n`;
      });
      
      const keyboardButtons = pendingMessages.slice(0, 5).map(feedback => [
        Markup.button.callback(
          `📩 Reply to ${feedback.user_first_name}`,
          `reply_${feedback.id}`
        )
      ]);
      
      keyboardButtons.push([
        Markup.button.callback('🔙 Dashboard', 'mini_dashboard')
      ]);
      
      const keyboard = Markup.inlineKeyboard(keyboardButtons);
      
      if (ctx.updateType === 'callback_query') {
        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          ...keyboard
        });
      } else {
        await ctx.replyWithMarkdown(message, keyboard);
      }
      
    } catch (error) {
      console.error('Show messages error:', error);
      await ctx.reply('❌ Error loading messages.');
    }
  };
}

// Add CustomCommandEngine class if it doesn't exist
class CustomCommandEngine {
  constructor() {
    this.flows = new Map();
  }

  async executeWelcomeFlow(flowData, ctx) {
    try {
      if (flowData.welcome_message) {
        await ctx.replyWithMarkdown(flowData.welcome_message);
        return { success: true };
      }
      return { success: false };
    } catch (error) {
      console.error('Custom command engine error:', error);
      return { success: false };
    }
  }

  async loadFlow(flowData) {
    // Implementation for loading flows
    return { success: true };
  }

  async handleMessage(ctx) {
    // Implementation for handling messages in custom flows
    return { handled: false };
  }
}
module.exports = new MiniBotManager();
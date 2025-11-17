const { Bot } = require('../models');
const { decrypt } = require('./encryption');
const axios = require('axios');

/**
 * Validate bot name
 */
function validateBotName(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Bot name is required' };
  }
  
  if (name.length < 2) {
    return { valid: false, error: 'Bot name must be at least 2 characters long' };
  }
  
  if (name.length > 50) {
    return { valid: false, error: 'Bot name must be less than 50 characters' };
  }
  
  // Check for invalid characters
  const invalidChars = /[<>{}[\]\\]/;
  if (invalidChars.test(name)) {
    return { valid: false, error: 'Bot name contains invalid characters' };
  }
  
  return { valid: true };
}

/**
 * Validate bot token format
 */
function validateTokenFormat(token) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Bot token is required' };
  }

  // Telegram bot token format: 1234567890:ABCdefGHIjklMNopQRSTuvwXYZ123456
  const tokenRegex = /^\d{9,11}:[A-Za-z0-9_-]{35}$/;
  if (!tokenRegex.test(token)) {
    return {
      valid: false,
      error: 'Invalid token format. It should look like: 1234567890:ABCdefGHIjklMNopQRSTuvwXYZ123456'
    };
  }

  return { valid: true };
}

/**
 * Check if token is unique across all bots
 */
async function isTokenUnique(token, excludeBotId = null) {
  try {
    const allBots = await Bot.findAll();
    
    for (const bot of allBots) {
      // Skip the current bot if we're updating
      if (excludeBotId && bot.id === excludeBotId) continue;
      
      try {
        const existingToken = decrypt(bot.bot_token);
        if (existingToken === token) {
          return {
            unique: false,
            existingBot: bot.bot_name
          };
        }
      } catch (decryptError) {
        // If we can't decrypt, skip this bot
        console.log(`⚠️ Could not decrypt token for ${bot.bot_name}`);
        continue;
      }
    }
    
    return { unique: true };
  } catch (error) {
    console.error('Error checking token uniqueness:', error);
    return { unique: false, error: 'Database error' };
  }
}

/**
 * Validate token with Telegram API - FIXED VERSION
 */
async function validateWithTelegram(token) {
  try {
    console.log(`🌐 Testing token with Telegram API...`);
    
    const response = await axios.get(`https://api.telegram.org/bot${token}/getMe`, {
      timeout: 10000
    });
    
    if (response.data.ok && response.data.result) {
      const botInfo = response.data.result;
      
      // Validate that we have the required fields
      if (!botInfo.id || !botInfo.username || !botInfo.first_name) {
        console.error('❌ Incomplete bot info from Telegram:', botInfo);
        return {
          valid: false,
          error: 'Incomplete bot information received from Telegram'
        };
      }
      
      console.log(`✅ Telegram API success: @${botInfo.username} (${botInfo.first_name})`);
      
      return {
        valid: true,
        botInfo: botInfo
      };
    } else {
      console.error('❌ Telegram API returned error:', response.data);
      return {
        valid: false,
        error: 'Telegram API returned an error: ' + (response.data.description || 'Unknown error')
      };
    }
  } catch (error) {
    console.error('❌ Telegram API validation failed:', error.message);
    
    let errorMessage = 'Failed to validate token with Telegram';
    
    if (error.response?.data?.description) {
      errorMessage = `Telegram API: ${error.response.data.description}`;
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = 'Telegram API timeout - please try again';
    } else if (error.message.includes('404')) {
      errorMessage = 'Bot not found - token may be invalid';
    } else {
      errorMessage = error.message;
    }
    
    return {
      valid: false,
      error: errorMessage
    };
  }
}

/**
 * Comprehensive bot token validation - FIXED VERSION
 */
async function validateBotToken(token, userId = null, excludeBotId = null) {
  const errors = [];
  const suggestions = [];
  let botInfo = null;

  console.log(`🔍 Validating token: ${token.substring(0, 15)}...`);

  // 1. Validate format
  const formatValidation = validateTokenFormat(token);
  if (!formatValidation.valid) {
    errors.push(formatValidation.error);
    suggestions.push('Get a valid token from @BotFather using /newbot command');
    return {
      isValid: false,
      errors,
      suggestions,
      botInfo: null
    };
  }

  // 2. Check uniqueness (only if format is valid)
  const uniquenessCheck = await isTokenUnique(token, excludeBotId);
  if (!uniquenessCheck.unique) {
    if (uniquenessCheck.existingBot) {
      errors.push(`This token is already used by: ${uniquenessCheck.existingBot}`);
    } else {
      errors.push('This token is already used by another bot');
    }
    suggestions.push('Each bot must have a unique token');
    
    // Return early if token is not unique
    return {
      isValid: false,
      errors,
      suggestions,
      botInfo: null
    };
  }

  // 3. Validate with Telegram API
  const telegramValidation = await validateWithTelegram(token);
  if (!telegramValidation.valid) {
    errors.push(telegramValidation.error);
    suggestions.push('Make sure the token is correct and the bot exists');
  } else {
    botInfo = telegramValidation.botInfo;
    console.log(`✅ Telegram validation successful:`, {
      id: botInfo?.id,
      username: botInfo?.username,
      name: botInfo?.first_name
    });
  }

  // 4. Check user bot limit (if userId provided)
  if (userId) {
    const userBotCount = await Bot.count({ where: { owner_id: userId } });
    const maxBots = parseInt(process.env.MAX_BOTS_PER_USER) || 10;
    
    if (userBotCount >= maxBots) {
      errors.push(`You have reached the maximum limit of ${maxBots} bots`);
      suggestions.push('Delete some bots to create new ones');
    }
  }

  // CRITICAL FIX: Ensure botInfo is properly structured
  if (botInfo) {
    botInfo = {
      id: botInfo.id,
      username: botInfo.username,
      first_name: botInfo.first_name,
      can_join_groups: botInfo.can_join_groups,
      can_read_all_group_messages: botInfo.can_read_all_group_messages,
      supports_inline_queries: botInfo.supports_inline_queries
    };
  }

  return {
    isValid: errors.length === 0,
    errors,
    suggestions,
    botInfo
  };
}

/**
 * Validate Telegram username
 */
function validateUsername(username) {
  if (!username) return { valid: true }; // Username is optional
  
  if (typeof username !== 'string') {
    return { valid: false, error: 'Username must be a string' };
  }
  
  if (username.length < 5) {
    return { valid: false, error: 'Username must be at least 5 characters long' };
  }
  
  if (!username.match(/^[a-zA-Z0-9_]+$/)) {
    return { valid: false, error: 'Username can only contain letters, numbers, and underscores' };
  }
  
  return { valid: true };
}

/**
 * Validate user ID
 */
function validateUserId(userId) {
  if (!userId || typeof userId !== 'number') {
    return { valid: false, error: 'User ID must be a number' };
  }
  
  if (userId.toString().length < 5) {
    return { valid: false, error: 'Invalid user ID' };
  }
  
  return { valid: true };
}

/**
 * Sanitize broadcast message
 */
function sanitizeMessage(text) {
  if (typeof text !== 'string') return '';
  
  // Remove potentially dangerous characters but keep most formatting
  return text
    .replace(/[<>]/g, '') // Remove < and > to prevent HTML injection
    .trim();
}

/**
 * Quick token format check (without API calls)
 */
function quickTokenCheck(token) {
  return validateTokenFormat(token);
}

module.exports = {
  validateBotName,
  validateBotToken,
  validateTokenFormat,
  isTokenUnique,
  validateWithTelegram,
  validateUsername,
  validateUserId,
  sanitizeMessage,
  quickTokenCheck
};
// src/utils/menuBuilder.js - Dynamic Menu Builder
const { Markup } = require("telegraf");

class MenuBuilder {
  /**
   * Create a dynamic menu with pagination
   * @param {Array} items - Array of items to display
   * @param {Function} itemRenderer - Function to render each item
   * @param {Object} options - Configuration options
   * @param {number} options.itemsPerPage - Items per page (default: 5)
   * @param {string} options.title - Menu title
   * @param {Array} options.actions - Additional action buttons
   * @param {string} options.backAction - Back button action
   * @param {number} options.page - Current page
   */
  static createPaginatedMenu(items, itemRenderer, options = {}) {
    const {
      itemsPerPage = 5,
      title = "📋 Menu",
      actions = [],
      backAction = "start",
      page = 0,
    } = options;

    const totalPages = Math.ceil(items.length / itemsPerPage);
    const start = page * itemsPerPage;
    const end = Math.min(start + itemsPerPage, items.length);
    const pageItems = items.slice(start, end);

    let message = `${title}\n\n`;

    if (pageItems.length === 0) {
      message += "No items found.\n\n";
    } else {
      pageItems.forEach((item, index) => {
        message += itemRenderer(item, start + index + 1);
      });
    }

    if (totalPages > 1) {
      message += `\n📄 Page ${page + 1} of ${totalPages}`;
    }

    // Build keyboard
    const keyboard = [];

    // Add items as buttons
    pageItems.forEach((item) => {
      if (item.button) {
        keyboard.push([item.button]);
      }
    });

    // Pagination buttons
    const navButtons = [];
    if (page > 0) {
      navButtons.push(Markup.button.callback("⬅️", `menu_page_${page - 1}`));
    }
    if (page < totalPages - 1) {
      navButtons.push(Markup.button.callback("➡️", `menu_page_${page + 1}`));
    }
    if (navButtons.length > 0) {
      keyboard.push(navButtons);
    }

    // Additional actions
    if (actions.length > 0) {
      keyboard.push(actions);
    }

    // Back button
    if (backAction) {
      keyboard.push([Markup.button.callback("🔙 Back", backAction)]);
    }

    return {
      message,
      keyboard: Markup.inlineKeyboard(keyboard),
      totalPages,
      currentPage: page,
      totalItems: items.length,
    };
  }

  /**
   * Create a confirmation menu
   * @param {string} title - Confirmation title
   * @param {string} message - Confirmation message
   * @param {string} confirmAction - Action for confirm button
   * @param {string} cancelAction - Action for cancel button
   * @param {Object} extraButtons - Additional buttons
   */
  static createConfirmation(
    title,
    message,
    confirmAction,
    cancelAction,
    extraButtons = [],
  ) {
    const keyboard = [
      [
        Markup.button.callback("✅ Confirm", confirmAction),
        Markup.button.callback("❌ Cancel", cancelAction),
      ],
    ];

    if (extraButtons.length > 0) {
      keyboard.push(extraButtons);
    }

    return {
      message: `${title}\n\n${message}\n\n⚠️ This action cannot be undone.`,
      keyboard: Markup.inlineKeyboard(keyboard),
    };
  }

  /**
   * Create a form input menu
   * @param {string} title - Form title
   * @param {string} instruction - Instruction text
   * @param {string} cancelAction - Cancel button action
   * @param {string} nextAction - Next button action (optional)
   */
  static createFormInput(title, instruction, cancelAction, nextAction = null) {
    const keyboard = [];

    if (nextAction) {
      keyboard.push([Markup.button.callback("✅ Confirm", nextAction)]);
    }

    keyboard.push([Markup.button.callback("❌ Cancel", cancelAction)]);

    return {
      message: `${title}\n\n${instruction}\n\n📝 Please type your response.`,
      keyboard: Markup.inlineKeyboard(keyboard),
    };
  }

  /**
   * Create a loading state menu
   * @param {string} message - Loading message
   */
  static createLoading(message = "⏳ Processing...") {
    return {
      message,
      keyboard: Markup.inlineKeyboard([
        [Markup.button.callback("⏳ Loading...", "noop")],
      ]),
    };
  }

  /**
   * Create a success menu
   * @param {string} title - Success title
   * @param {string} message - Success message
   * @param {string} backAction - Back button action
   */
  static createSuccess(title, message, backAction = "start") {
    return {
      message: `✅ ${title}\n\n${message}`,
      keyboard: Markup.inlineKeyboard([
        [Markup.button.callback("🔙 Back", backAction)],
      ]),
    };
  }

  /**
   * Create an error menu
   * @param {string} title - Error title
   * @param {string} message - Error message
   * @param {string} retryAction - Retry button action
   * @param {string} backAction - Back button action
   */
  static createError(title, message, retryAction = null, backAction = "start") {
    const keyboard = [];

    if (retryAction) {
      keyboard.push([Markup.button.callback("🔄 Retry", retryAction)]);
    }

    keyboard.push([Markup.button.callback("🔙 Back", backAction)]);

    return {
      message: `❌ ${title}\n\n${message}`,
      keyboard: Markup.inlineKeyboard(keyboard),
    };
  }

  /**
   * Create a simple action menu
   * @param {string} title - Menu title
   * @param {Array} actions - Array of action buttons
   */
  static createActionMenu(title, actions) {
    const keyboard = [];

    actions.forEach((action) => {
      if (Array.isArray(action)) {
        keyboard.push(action);
      } else {
        keyboard.push([action]);
      }
    });

    return {
      message: title,
      keyboard: Markup.inlineKeyboard(keyboard),
    };
  }

  /**
   * Create a menu with auto-delete functionality
   * @param {Object} ctx - Telegraf context
   * @param {string} message - Message to display
   * @param {Object} keyboard - Inline keyboard
   * @param {number} delay - Auto-delete delay in ms (default: 5000)
   */
  static async sendAutoDelete(ctx, message, keyboard = null, delay = 5000) {
    const sent = await ctx.reply(message, keyboard);
    setTimeout(async () => {
      try {
        await ctx.deleteMessage(sent.message_id);
      } catch (e) {
        // Message already deleted or not accessible
      }
    }, delay);
    return sent;
  }
}

module.exports = MenuBuilder;

// src/utils/sessionManager.js - Session State Management
class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.sessionTimeout = 30 * 60 * 1000; // 30 minutes
  }

  /**
   * Create or update a session
   * @param {string|number} userId - User ID
   * @param {Object} data - Session data
   * @param {string} data.menu - Current menu name
   * @param {string} data.action - Current action
   * @param {Object} data.context - Additional context data
   * @param {Array} data.history - Navigation history
   */
  setSession(userId, data) {
    const session = this.sessions.get(userId) || {
      history: [],
      context: {},
      createdAt: Date.now(),
    };

    // Update session
    Object.assign(session, data);
    session.updatedAt = Date.now();

    // Add to history if menu changed
    if (data.menu && session.menu !== data.menu) {
      session.history.push({
        menu: session.menu,
        action: session.action,
        context: { ...session.context },
      });
      // Keep history limited
      if (session.history.length > 20) {
        session.history.shift();
      }
    }

    this.sessions.set(userId, session);
    return session;
  }

  /**
   * Get a session
   * @param {string|number} userId - User ID
   * @returns {Object|null} Session data or null if not found
   */
  getSession(userId) {
    const session = this.sessions.get(userId);
    if (!session) return null;

    // Check if session expired
    if (Date.now() - session.updatedAt > this.sessionTimeout) {
      this.sessions.delete(userId);
      return null;
    }

    return session;
  }

  /**
   * Clear a session
   * @param {string|number} userId - User ID
   */
  clearSession(userId) {
    this.sessions.delete(userId);
  }

  /**
   * Navigate back in history
   * @param {string|number} userId - User ID
   * @returns {Object|null} Previous session state or null
   */
  goBack(userId) {
    const session = this.getSession(userId);
    if (!session || session.history.length === 0) return null;

    const previous = session.history.pop();
    Object.assign(session, previous);
    this.sessions.set(userId, session);

    return session;
  }

  /**
   * Check if user is in a specific menu
   * @param {string|number} userId - User ID
   * @param {string} menuName - Menu name to check
   * @returns {boolean}
   */
  isInMenu(userId, menuName) {
    const session = this.getSession(userId);
    return session && session.menu === menuName;
  }

  /**
   * Check if user is in a specific action
   * @param {string|number} userId - User ID
   * @param {string} actionName - Action name to check
   * @returns {boolean}
   */
  isInAction(userId, actionName) {
    const session = this.getSession(userId);
    return session && session.action === actionName;
  }

  /**
   * Update session context
   * @param {string|number} userId - User ID
   * @param {Object} context - New context data
   */
  updateContext(userId, context) {
    const session = this.getSession(userId);
    if (session) {
      session.context = { ...session.context, ...context };
      this.sessions.set(userId, session);
    }
  }

  /**
   * Get session context
   * @param {string|number} userId - User ID
   * @returns {Object} Context data
   */
  getContext(userId) {
    const session = this.getSession(userId);
    return session ? session.context : {};
  }

  /**
   * Clean up expired sessions
   */
  cleanup() {
    const now = Date.now();
    for (const [userId, session] of this.sessions.entries()) {
      if (now - session.updatedAt > this.sessionTimeout) {
        this.sessions.delete(userId);
      }
    }
  }

  /**
   * Get session stats
   * @returns {Object} Session statistics
   */
  getStats() {
    const total = this.sessions.size;
    let active = 0;
    for (const [, session] of this.sessions.entries()) {
      if (Date.now() - session.updatedAt < 5 * 60 * 1000) {
        active++;
      }
    }
    return { total, active };
  }

  /**
   * Delete a specific session
   * @param {string|number} userId - User ID
   */
  deleteSession(userId) {
    this.sessions.delete(userId);
  }
}

module.exports = new SessionManager();

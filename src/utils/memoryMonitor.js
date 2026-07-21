// src/utils/memoryMonitor.js - SAFE MONITORING ONLY
const fs = require('fs');
const path = require('path');

class MemoryMonitor {
  constructor() {
    this.logFile = path.join(__dirname, '../../logs/memory-usage.log');
    this.maxLogSize = 10 * 1024 * 1024; // 10MB max log file size
    this.checkInterval = 60000; // Check every minute
    this.warningThresholdMB = 700; // Warn at 700MB
    this.criticalThresholdMB = 900; // Critical at 900MB
    
    this.ensureLogDirectory();
    this.startMonitoring();
  }
  
  ensureLogDirectory() {
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }
  
  rotateLogFileIfNeeded() {
    try {
      if (fs.existsSync(this.logFile)) {
        const stats = fs.statSync(this.logFile);
        if (stats.size > this.maxLogSize) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const rotatedFile = this.logFile.replace('.log', `-${timestamp}.log`);
          fs.renameSync(this.logFile, rotatedFile);
          console.log(`📁 Rotated log file to: ${rotatedFile}`);
        }
      }
    } catch (error) {
      console.error('Log rotation error:', error.message);
    }
  }
  
  logToFile(message) {
    try {
      this.rotateLogFileIfNeeded();
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] ${message}\n`;
      fs.appendFileSync(this.logFile, logEntry, 'utf8');
    } catch (error) {
      console.error('Failed to write to log file:', error.message);
    }
  }
  
  getMemoryUsage() {
    const used = process.memoryUsage();
    return {
      rss: Math.round(used.rss / 1024 / 1024),
      heapTotal: Math.round(used.heapTotal / 1024 / 1024),
      heapUsed: Math.round(used.heapUsed / 1024 / 1024),
      external: Math.round(used.external / 1024 / 1024),
      timestamp: new Date().toISOString()
    };
  }
  
  getFormattedMemoryString(usage) {
    return `RSS: ${usage.rss}MB | Heap: ${usage.heapUsed}MB/${usage.heapTotal}MB | External: ${usage.external}MB`;
  }
  
  checkMemoryHealth(usage) {
    if (usage.rss > this.criticalThresholdMB) {
      return { status: 'CRITICAL', message: `Memory usage critical: ${usage.rss}MB > ${this.criticalThresholdMB}MB` };
    } else if (usage.rss > this.warningThresholdMB) {
      return { status: 'WARNING', message: `High memory usage: ${usage.rss}MB > ${this.warningThresholdMB}MB` };
    }
    return { status: 'HEALTHY', message: 'Memory usage normal' };
  }
  
  startMonitoring() {
    console.log('📊 Starting memory monitoring...');
    console.log(`   Log file: ${this.logFile}`);
    console.log(`   Check interval: ${this.checkInterval/1000} seconds`);
    console.log(`   Warning threshold: ${this.warningThresholdMB}MB`);
    console.log(`   Critical threshold: ${this.criticalThresholdMB}MB`);
    
    setInterval(() => {
      this.checkMemory();
    }, this.checkInterval);
    
    // Initial check
    setTimeout(() => this.checkMemory(), 5000);
  }
  
  async checkMemory() {
    try {
      const usage = this.getMemoryUsage();
      const health = this.checkMemoryHealth(usage);
      const formatted = this.getFormattedMemoryString(usage);
      
      // Console output
      console.log(`📊 ${health.status === 'HEALTHY' ? '✅' : health.status === 'WARNING' ? '⚠️' : '🚨'} ${formatted}`);
      
      // File logging
      this.logToFile(`${health.status} - ${formatted}`);
      
      // Take action based on health
      if (health.status === 'CRITICAL') {
        await this.handleCriticalMemory(usage);
      } else if (health.status === 'WARNING') {
        await this.handleWarningMemory(usage);
      }
      
      return { usage, health };
      
    } catch (error) {
      console.error('Memory check error:', error.message);
    }
  }
  
  async handleWarningMemory(usage) {
    // Just log for now - safe action
    console.log('⚠️  High memory usage detected. Consider cleaning up sessions.');
    this.logToFile(`WARNING: High memory usage - ${JSON.stringify(usage)}`);
  }
  
  async handleCriticalMemory(usage) {
    console.log('🚨 CRITICAL memory usage! Logging details...');
    
    // SAFE: Only log, don't take destructive actions
    try {
      // Log active processes count
      const activeBotsCount = global.miniBotManager?.activeBots?.size || 0;
      const sessionCounts = {
        broadcast: global.miniBotManager?.broadcastSessions?.size || 0,
        welcome: global.miniBotManager?.welcomeMessageSessions?.size || 0,
        donation: global.miniBotManager?.donationSessions?.size || 0,
        reply: global.miniBotManager?.replySessions?.size || 0
      };
      
      const criticalLog = `CRITICAL MEMORY - Usage: ${JSON.stringify(usage)} | Active Bots: ${activeBotsCount} | Sessions: ${JSON.stringify(sessionCounts)}`;
      console.log(criticalLog);
      this.logToFile(criticalLog);
      
      // Log stack trace to identify memory leaks
      console.log('📝 Current stack trace:');
      console.trace();
      
    } catch (error) {
      console.error('Critical memory handler error:', error);
    }
  }
  
  // Method to manually trigger memory check
  manualCheck() {
    console.log('🔍 Manual memory check triggered');
    return this.checkMemory();
  }
  
  // Get memory statistics
  getStatistics() {
    const usage = this.getMemoryUsage();
    const health = this.checkMemoryHealth(usage);
    
    return {
      current: usage,
      health: health,
      thresholds: {
        warning: this.warningThresholdMB,
        critical: this.criticalThresholdMB
      },
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  }
}

// Create singleton instance
const memoryMonitor = new MemoryMonitor();

// Export for use in other files
module.exports = memoryMonitor;
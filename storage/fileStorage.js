const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '../data');
const EVENTS_FILE = path.join(DATA_DIR, 'events.json');
const DEDUP_FILE = path.join(DATA_DIR, 'deduplication.json');

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (error) {
    // Directory already exists
  }
}

// Initialize files if they don't exist
async function initializeFiles() {
  await ensureDataDir();
  try {
    await fs.access(EVENTS_FILE);
  } catch {
    await fs.writeFile(EVENTS_FILE, JSON.stringify([], null, 2));
  }
  try {
    await fs.access(DEDUP_FILE);
  } catch {
    await fs.writeFile(DEDUP_FILE, JSON.stringify([], null, 2));
  }
}

// Simple file locking mechanism
let fileLock = false;
const lockQueue = [];

async function acquireLock() {
  return new Promise((resolve) => {
    if (!fileLock) {
      fileLock = true;
      resolve();
    } else {
      lockQueue.push(resolve);
    }
  });
}

function releaseLock() {
  fileLock = false;
  if (lockQueue.length > 0) {
    const next = lockQueue.shift();
    fileLock = true;
    next();
  }
}

/**
 * File-based storage service
 */
class FileStorage {
  constructor() {
    this.initialized = false;
  }

  async initialize() {
    if (!this.initialized) {
      await initializeFiles();
      this.initialized = true;
    }
  }

  /**
   * Read events from file
   */
  async readEvents() {
    await this.initialize();
    try {
      const data = await fs.readFile(EVENTS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return [];
    }
  }

  /**
   * Write events to file
   */
  async writeEvents(events) {
    await this.initialize();
    await acquireLock();
    try {
      await fs.writeFile(EVENTS_FILE, JSON.stringify(events, null, 2));
    } finally {
      releaseLock();
    }
  }

  /**
   * Read deduplication records
   */
  async readDedupRecords() {
    await this.initialize();
    try {
      const data = await fs.readFile(DEDUP_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return [];
    }
  }

  /**
   * Write deduplication records
   */
  async writeDedupRecords(records) {
    await this.initialize();
    await acquireLock();
    try {
      await fs.writeFile(DEDUP_FILE, JSON.stringify(records, null, 2));
    } finally {
      releaseLock();
    }
  }

  /**
   * Create a new event
   */
  async createEvent(eventData) {
    const events = await this.readEvents();
    const event = {
      _id: crypto.randomUUID(),
      ...eventData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    events.push(event);
    await this.writeEvents(events);
    return event;
  }

  /**
   * Find event by ID
   */
  async findEventById(id) {
    const events = await this.readEvents();
    return events.find(e => e._id === id) || null;
  }

  /**
   * Find events by query
   */
  async findEvents(query = {}, options = {}) {
    const events = await this.readEvents();
    let filtered = events.filter(event => {
      if (query.clientId && event.clientId !== query.clientId) return false;
      if (query.status && event.status !== query.status) return false;
      if (query.metric && event.metric !== query.metric) return false;
      if (query.eventHash && event.eventHash !== query.eventHash) return false;
      
      if (query.timestamp) {
        const eventTs = new Date(event.timestamp);
        if (query.timestamp.$gte && eventTs < new Date(query.timestamp.$gte)) return false;
        if (query.timestamp.$lte && eventTs > new Date(query.timestamp.$lte)) return false;
      }
      
      return true;
    });

    // Sort
    if (options.sort) {
      const [field, direction] = Object.entries(options.sort)[0];
      filtered.sort((a, b) => {
        const aVal = a[field];
        const bVal = b[field];
        if (aVal < bVal) return direction === -1 ? 1 : -1;
        if (aVal > bVal) return direction === -1 ? -1 : 1;
        return 0;
      });
    } else {
      // Default sort by timestamp descending
      filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    // Pagination
    const skip = options.skip || 0;
    const limit = options.limit || filtered.length;
    const paginated = filtered.slice(skip, skip + limit);

    return paginated;
  }

  /**
   * Count events by query
   */
  async countEvents(query = {}) {
    const events = await this.readEvents();
    return events.filter(event => {
      if (query.clientId && event.clientId !== query.clientId) return false;
      if (query.status && event.status !== query.status) return false;
      if (query.metric && event.metric !== query.metric) return false;
      
      if (query.timestamp) {
        const eventTs = new Date(event.timestamp);
        if (query.timestamp.$gte && eventTs < new Date(query.timestamp.$gte)) return false;
        if (query.timestamp.$lte && eventTs > new Date(query.timestamp.$lte)) return false;
      }
      
      return true;
    }).length;
  }

  /**
   * Delete event by ID
   */
  async deleteEventById(id) {
    const events = await this.readEvents();
    const filtered = events.filter(e => e._id !== id);
    await this.writeEvents(filtered);
    return events.length !== filtered.length;
  }

  /**
   * Find deduplication record by eventHash
   */
  async findDedupRecord(eventHash) {
    const records = await this.readDedupRecords();
    return records.find(r => r.eventHash === eventHash) || null;
  }

  /**
   * Create or update deduplication record
   */
  async upsertDedupRecord(eventHash, clientId, eventId) {
    const records = await this.readDedupRecords();
    const existingIndex = records.findIndex(r => r.eventHash === eventHash);
    
    const record = {
      eventHash,
      clientId,
      eventId,
      processedAt: new Date().toISOString(),
      createdAt: existingIndex >= 0 ? records[existingIndex].createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      records[existingIndex] = record;
    } else {
      records.push(record);
    }

    await this.writeDedupRecords(records);
    return record;
  }

  /**
   * Aggregate events (simple in-memory aggregation)
   */
  async aggregateEvents(matchCriteria, groupBy) {
    const events = await this.readEvents();
    
    // Filter events
    let filtered = events.filter(event => {
      if (matchCriteria.status && event.status !== matchCriteria.status) return false;
      if (matchCriteria.clientId && event.clientId !== matchCriteria.clientId) return false;
      if (matchCriteria.metric && event.metric !== matchCriteria.metric) return false;
      
      if (matchCriteria.timestamp) {
        const eventTs = new Date(event.timestamp);
        if (matchCriteria.timestamp.$gte && eventTs < new Date(matchCriteria.timestamp.$gte)) return false;
        if (matchCriteria.timestamp.$lte && eventTs > new Date(matchCriteria.timestamp.$lte)) return false;
      }
      
      return true;
    });

    // Group and aggregate
    const groups = new Map();

    filtered.forEach(event => {
      let groupKey;
      if (groupBy === 'clientId') {
        groupKey = event.clientId;
      } else if (groupBy === 'metric') {
        groupKey = event.metric;
      } else if (groupBy === 'both') {
        groupKey = `${event.clientId}|${event.metric}`;
      } else {
        groupKey = 'all';
      }

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          totalAmount: 0,
          totalCount: 0,
          amounts: [],
        });
      }

      const group = groups.get(groupKey);
      group.totalAmount += event.amount;
      group.totalCount += 1;
      group.amounts.push(event.amount);
    });

    // Convert to result format
    const results = Array.from(groups.entries()).map(([key, data]) => {
      const amounts = data.amounts.sort((a, b) => a - b);
      const result = {
        totalAmount: data.totalAmount,
        totalCount: data.totalCount,
        averageAmount: data.totalAmount / data.totalCount,
        minAmount: amounts[0],
        maxAmount: amounts[amounts.length - 1],
      };

      if (groupBy === 'clientId' || groupBy === 'metric') {
        result.group = key;
      } else if (groupBy === 'both') {
        const [clientId, metric] = key.split('|');
        result.group = { clientId, metric };
      }

      return result;
    });

    // Sort by totalAmount descending
    results.sort((a, b) => b.totalAmount - a.totalAmount);

    return groupBy === 'none' ? (results[0] || {}) : results;
  }
}

module.exports = new FileStorage();


const crypto = require('crypto');

/**
 * Normalizes raw event data into canonical format
 * Handles varying field names, types, and missing fields
 */
class NormalizationService {
  /**
   * Generate a hash for deduplication based on event content
   * Uses client_id, metric, amount, and timestamp to create a deterministic hash
   */
  generateEventHash(normalizedData) {
    const hashInput = `${normalizedData.clientId}|${normalizedData.metric}|${normalizedData.amount}|${normalizedData.timestamp}`;
    return crypto.createHash('sha256').update(hashInput).digest('hex');
  }

  /**
   * Extract client ID from various possible field names
   */
  extractClientId(payload) {
    const possibleFields = ['source', 'client_id', 'clientId', 'client', 'origin'];
    for (const field of possibleFields) {
      if (payload[field] !== undefined && payload[field] !== null) {
        return String(payload[field]).trim();
      }
    }
    // Check in nested payload
    if (payload.payload && typeof payload.payload === 'object') {
      const nestedResult = this.extractClientId(payload.payload);
      if (nestedResult) {
        return nestedResult;
      }
    }
    throw new Error('client_id not found in event');
  }

  /**
   * Extract and normalize metric name
   */
  extractMetric(payload) {
    const possibleFields = ['metric', 'event_type', 'type', 'eventType', 'name'];
    for (const field of possibleFields) {
      if (payload[field] !== undefined && payload[field] !== null) {
        return String(payload[field]).trim();
      }
    }
    // Check in nested payload
    if (payload.payload && typeof payload.payload === 'object') {
      const nestedResult = this.extractMetric(payload.payload);
      if (nestedResult && nestedResult !== 'unknown') {
        return nestedResult;
      }
    }
    return 'unknown';
  }

  /**
   * Extract and normalize amount/numeric value
   */
  extractAmount(payload) {
    const possibleFields = ['amount', 'value', 'count', 'quantity', 'total', 'price'];
    for (const field of possibleFields) {
      if (payload[field] !== undefined && payload[field] !== null) {
        const value = payload[field];
        // Handle string numbers
        if (typeof value === 'string') {
          const parsed = parseFloat(value.replace(/[^\d.-]/g, ''));
          if (!isNaN(parsed)) {
            return parsed;
          }
        }
        // Handle numeric types
        if (typeof value === 'number') {
          return value;
        }
      }
    }
    // Check in nested payload
    if (payload.payload && typeof payload.payload === 'object') {
      const nestedAmount = this.extractAmount(payload.payload);
      if (nestedAmount !== null) {
        return nestedAmount;
      }
    }
    throw new Error('amount not found or invalid in event');
  }

  /**
   * Extract and normalize timestamp
   */
  extractTimestamp(payload) {
    const possibleFields = ['timestamp', 'time', 'date', 'created_at', 'createdAt', 'ts'];
    for (const field of possibleFields) {
      if (payload[field] !== undefined && payload[field] !== null) {
        const value = payload[field];
        const date = this.parseDate(value);
        if (date && !isNaN(date.getTime())) {
          return date;
        }
      }
    }
    // Check in nested payload
    if (payload.payload && typeof payload.payload === 'object') {
      const nestedTs = this.extractTimestamp(payload.payload);
      if (nestedTs) {
        return nestedTs;
      }
    }
    // Default to current time if not found
    return new Date();
  }

  /**
   * Parse various date formats
   */
  parseDate(value) {
    if (value instanceof Date) {
      return value;
    }
    if (typeof value === 'number') {
      // Handle Unix timestamps (both seconds and milliseconds)
      if (value < 10000000000) {
        return new Date(value * 1000);
      }
      return new Date(value);
    }
    if (typeof value === 'string') {
      // Try ISO format
      let date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date;
      }
      // Try common formats like "2024/01/01"
      const formats = [
        /(\d{4})\/(\d{1,2})\/(\d{1,2})/,
        /(\d{4})-(\d{1,2})-(\d{1,2})/,
        /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
      ];
      for (const format of formats) {
        const match = value.match(format);
        if (match) {
          const year = match[1].length === 4 ? match[1] : match[3];
          const month = match[1].length === 4 ? match[2] : match[1];
          const day = match[1].length === 4 ? match[3] : match[2];
          date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
          if (!isNaN(date.getTime())) {
            return date;
          }
        }
      }
    }
    return null;
  }

  /**
   * Main normalization function
   */
  normalize(rawEvent) {
    try {
      // Handle nested payload structure
      const payload = rawEvent.payload || rawEvent;

      const normalized = {
        clientId: this.extractClientId(rawEvent),
        metric: this.extractMetric(payload),
        amount: this.extractAmount(payload),
        timestamp: this.extractTimestamp(payload),
      };

      // Generate hash for deduplication
      normalized.eventHash = this.generateEventHash(normalized);

      return {
        success: true,
        normalized,
        originalPayload: rawEvent,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        originalPayload: rawEvent,
      };
    }
  }
}

module.exports = new NormalizationService();


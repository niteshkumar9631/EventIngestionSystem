const DeduplicationRecord = require('../models/DeduplicationRecord');
const Event = require('../models/Event');

/**
 * Service for handling idempotency and deduplication
 */
class DeduplicationService {
  /**
   * Check if an event with this hash has already been processed
   */
  async isDuplicate(eventHash) {
    try {
      const record = await DeduplicationRecord.findOne({ eventHash });
      return !!record;
    } catch (error) {
      // On error, assume not duplicate to avoid false positives
      // In production, you might want different error handling
      console.error('Error checking duplicate:', error);
      return false;
    }
  }

  /**
   * Record an event as processed (idempotent operation)
   * Uses a two-phase approach: check dedup record, then insert event
   */
  async recordProcessedEvent(eventHash, clientId, eventId) {
    try {
      // Check if already exists
      const existing = await DeduplicationRecord.findOne({ eventHash });
      if (existing) {
        return false;
      }
      
      // Use upsert to handle race conditions
      await DeduplicationRecord.findOneAndUpdate(
        { eventHash },
        {
          eventHash,
          clientId,
          eventId,
          processedAt: new Date(),
        },
        { upsert: true, new: true }
      );
      return true;
    } catch (error) {
      // On error, assume already exists to avoid duplicates
      console.error('Error recording dedup:', error);
      return false;
    }
  }

  /**
   * Get the existing event ID if this is a duplicate
   */
  async getExistingEventId(eventHash) {
    try {
      const record = await DeduplicationRecord.findOne({ eventHash });
      return record ? record.eventId : null;
    } catch (error) {
      console.error('Error getting existing event ID:', error);
      return null;
    }
  }
}

module.exports = new DeduplicationService();


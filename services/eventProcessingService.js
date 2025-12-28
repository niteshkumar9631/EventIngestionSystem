const Event = require('../models/Event');
const normalizationService = require('./normalizationService');
const deduplicationService = require('./deduplicationService');

/**
 * Service for processing events with fault tolerance
 */
class EventProcessingService {
  /**
   * Process a single event with idempotency and failure handling
   * Returns: { success, event, isDuplicate, error }
   */
  async processEvent(rawEvent, simulateFailure = false) {
    // Step 1: Normalize the event
    const normalizationResult = normalizationService.normalize(rawEvent);
    
    if (!normalizationResult.success) {
      // Create rejected event record
      try {
        const rejectedEvent = new Event({
          clientId: 'unknown',
          metric: 'rejected',
          amount: 0,
          timestamp: new Date(),
          eventHash: `rejected_${Date.now()}_${Math.random()}`,
          status: 'rejected',
          rejectionReason: normalizationResult.error,
          originalPayload: rawEvent,
        });
        await rejectedEvent.save();
        return {
          success: false,
          event: rejectedEvent,
          isDuplicate: false,
          error: normalizationResult.error,
        };
      } catch (error) {
        return {
          success: false,
          event: null,
          isDuplicate: false,
          error: `Failed to save rejected event: ${error.message}`,
        };
      }
    }

    const { normalized, originalPayload } = normalizationResult;
    const { eventHash, clientId } = normalized;

    // Step 2: Check for duplicates (idempotency check)
    const isDuplicate = await deduplicationService.isDuplicate(eventHash);
    
    if (isDuplicate) {
      // Return existing event
      const existingEventId = await deduplicationService.getExistingEventId(eventHash);
      if (existingEventId) {
        const existingEvent = await Event.findById(existingEventId);
        return {
          success: true,
          event: existingEvent,
          isDuplicate: true,
          error: null,
        };
      }
    }

    // Step 3: Simulate failure if requested (for testing)
    if (simulateFailure) {
      throw new Error('Simulated database failure');
    }

    // Step 4: Create event record within a transaction-like pattern
    // Since we're using a single operation, we rely on unique index for eventHash
    let event;
    try {
      event = new Event({
        ...normalized,
        status: 'processed',
        originalPayload,
      });

      // Save event first
      await event.save();

      // Then record in deduplication table
      // If this fails, we still have the event, but dedup might fail
      // In production, you'd want a transaction here
      const dedupResult = await deduplicationService.recordProcessedEvent(eventHash, clientId, event._id);
      if (!dedupResult) {
        // Dedup record already exists, meaning another request processed this
        // Delete our event and return the existing one
        await Event.findByIdAndDelete(event._id);
        const existingEventId = await deduplicationService.getExistingEventId(eventHash);
        if (existingEventId) {
          const existingEvent = await Event.findById(existingEventId);
          if (existingEvent) {
            return {
              success: true,
              event: existingEvent,
              isDuplicate: true,
              error: null,
            };
          }
        }
      }

      return {
        success: true,
        event,
        isDuplicate: false,
        error: null,
      };
    } catch (error) {
      // Check if event was already processed (race condition)
      const existingEventId = await deduplicationService.getExistingEventId(eventHash);
      if (existingEventId) {
        const existingEvent = await Event.findById(existingEventId);
        if (existingEvent) {
          return {
            success: true,
            event: existingEvent,
            isDuplicate: true,
            error: null,
          };
        }
      }

      // For other errors, create a failed event record
      try {
        const failedEvent = new Event({
          ...normalized,
          status: 'failed',
          rejectionReason: error.message,
          originalPayload,
        });
        await failedEvent.save();
        return {
          success: false,
          event: failedEvent,
          isDuplicate: false,
          error: error.message,
        };
      } catch (saveError) {
        return {
          success: false,
          event: null,
          isDuplicate: false,
          error: `Failed to process event: ${error.message}`,
        };
      }
    }
  }

  /**
   * Process multiple events
   */
  async processEvents(rawEvents, simulateFailure = false) {
    const results = [];
    for (const rawEvent of rawEvents) {
      const result = await this.processEvent(rawEvent, simulateFailure);
      results.push(result);
    }
    return results;
  }
}

module.exports = new EventProcessingService();


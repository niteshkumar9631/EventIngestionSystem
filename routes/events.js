const express = require('express');
const router = express.Router();
const eventProcessingService = require('../services/eventProcessingService');

/**
 * POST /api/events
 * Ingests a single event or array of events
 * Query param: simulateFailure=true to simulate DB failure
 */
router.post('/', async (req, res) => {
  try {
    const { body } = req;
    const simulateFailure = req.query.simulateFailure === 'true';

    // Handle both single event and array of events
    const events = Array.isArray(body) ? body : [body];
    
    if (events.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No events provided',
      });
    }

    const results = await eventProcessingService.processEvents(events, simulateFailure);

    // Separate successful and failed results
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    res.status(200).json({
      success: true,
      processed: successful.length,
      failed: failed.length,
      results: results.map(r => ({
        success: r.success,
        eventId: r.event ? r.event._id : null,
        isDuplicate: r.isDuplicate,
        error: r.error || null,
      })),
    });
  } catch (error) {
    console.error('Event ingestion error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/events
 * Retrieve events with optional filtering
 */
router.get('/', async (req, res) => {
  try {
    const Event = require('../models/Event');
    const { clientId, status, startDate, endDate, limit = 100, skip = 0 } = req.query;

    const query = {};

    if (clientId) {
      query.clientId = clientId;
    }

    if (status) {
      query.status = status;
    }

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        query.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        query.timestamp.$lte = new Date(endDate);
      }
    }

    const events = await Event.find(query, {
      sort: { timestamp: -1 },
      limit: parseInt(limit),
      skip: parseInt(skip),
    });

    const total = await Event.countDocuments(query);

    res.json({
      success: true,
      events,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip),
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;


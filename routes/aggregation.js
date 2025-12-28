const express = require('express');
const router = express.Router();
const Event = require('../models/Event');

/**
 * GET /api/aggregation
 * Get aggregated metrics with optional filters
 * Query params: clientId, startDate, endDate, metric, groupBy (clientId|metric|none)
 */
router.get('/', async (req, res) => {
  try {
    const { clientId, startDate, endDate, metric, groupBy = 'none' } = req.query;

    // Build match criteria
    const matchCriteria = {
      status: 'processed', // Only aggregate successfully processed events
    };

    if (clientId) {
      matchCriteria.clientId = clientId;
    }

    if (metric) {
      matchCriteria.metric = metric;
    }

    if (startDate || endDate) {
      matchCriteria.timestamp = {};
      if (startDate) {
        matchCriteria.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        matchCriteria.timestamp.$lte = new Date(endDate);
      }
    }

    // Build aggregation pipeline
    const pipeline = [
      { $match: matchCriteria },
    ];

    // Group by logic
    const groupStage = {
      _id: null,
      totalAmount: { $sum: '$amount' },
      totalCount: { $sum: 1 },
      averageAmount: { $avg: '$amount' },
      minAmount: { $min: '$amount' },
      maxAmount: { $max: '$amount' },
    };

    if (groupBy === 'clientId') {
      groupStage._id = '$clientId';
    } else if (groupBy === 'metric') {
      groupStage._id = '$metric';
    } else if (groupBy === 'both') {
      groupStage._id = {
        clientId: '$clientId',
        metric: '$metric',
      };
    }

    pipeline.push({ $group: groupStage });

    if (groupBy !== 'none') {
      pipeline.push({
        $project: {
          _id: 0,
          group: '$_id',
          totalAmount: 1,
          totalCount: 1,
          averageAmount: 1,
          minAmount: 1,
          maxAmount: 1,
        },
      });
      pipeline.push({ $sort: { totalAmount: -1 } });
    } else {
      pipeline.push({
        $project: {
          _id: 0,
          totalAmount: 1,
          totalCount: 1,
          averageAmount: 1,
          minAmount: 1,
          maxAmount: 1,
        },
      });
    }

    const results = await Event.aggregate(pipeline);

    // Get additional stats
    const totalEvents = await Event.countDocuments(matchCriteria);
    const rejectedEvents = await Event.countDocuments({
      status: 'rejected',
      ...matchCriteria,
    });
    const failedEvents = await Event.countDocuments({
      status: 'failed',
      ...matchCriteria,
    });

    res.json({
      success: true,
      aggregation: groupBy === 'none' ? results[0] || {} : results,
      statistics: {
        totalProcessed: totalEvents,
        rejected: rejectedEvents,
        failed: failedEvents,
      },
      filters: {
        clientId: clientId || 'all',
        metric: metric || 'all',
        startDate: startDate || null,
        endDate: endDate || null,
        groupBy,
      },
    });
  } catch (error) {
    console.error('Aggregation error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;


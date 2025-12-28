const fileStorage = require('../storage/fileStorage');

/**
 * Event model - file-based storage wrapper
 */
class Event {
  constructor(data) {
    Object.assign(this, data);
    if (!this.processedAt) {
      this.processedAt = new Date();
    }
    if (!this.status) {
      this.status = 'processed';
    }
    if (!this.retryCount) {
      this.retryCount = 0;
    }
  }

  async save() {
    const saved = await fileStorage.createEvent(this);
    // Update this instance with saved data (including _id)
    Object.assign(this, saved);
    return saved;
  }

  static async findById(id) {
    return await fileStorage.findEventById(id);
  }

  static async find(query = {}, options = {}) {
    return await fileStorage.findEvents(query, options);
  }

  static async countDocuments(query = {}) {
    return await fileStorage.countEvents(query);
  }

  static async findByIdAndDelete(id) {
    await fileStorage.deleteEventById(id);
    return null;
  }

  static async aggregate(pipeline) {
    // Convert MongoDB aggregation pipeline to our format
    const matchStage = pipeline.find(s => s.$match);
    const groupStage = pipeline.find(s => s.$group);
    const projectStage = pipeline.find(s => s.$project);

    const matchCriteria = matchStage ? matchStage.$match : {};
    let groupBy = 'none';

    if (groupStage && groupStage.$group) {
      const _id = groupStage.$group._id;
      if (_id === '$clientId') {
        groupBy = 'clientId';
      } else if (_id === '$metric') {
        groupBy = 'metric';
      } else if (_id && _id.clientId && _id.metric) {
        groupBy = 'both';
      }
    }

    const result = await fileStorage.aggregateEvents(matchCriteria, groupBy);
    return Array.isArray(result) ? result : [result];
  }
}

module.exports = Event;

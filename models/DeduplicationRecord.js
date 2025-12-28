const fileStorage = require('../storage/fileStorage');

/**
 * DeduplicationRecord model - file-based storage wrapper
 */
class DeduplicationRecord {
  constructor(data) {
    Object.assign(this, data);
  }

  static async findOne(query) {
    if (query.eventHash) {
      return await fileStorage.findDedupRecord(query.eventHash);
    }
    return null;
  }

  static async findOneAndUpdate(query, update, options = {}) {
    if (query.eventHash) {
      const record = await fileStorage.upsertDedupRecord(
        update.eventHash || query.eventHash,
        update.clientId,
        update.eventId
      );
      return record;
    }
    return null;
  }
}

module.exports = DeduplicationRecord;

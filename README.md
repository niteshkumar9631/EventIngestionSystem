# Event Ingestion System

A fault-tolerant data processing system that ingests unreliable events from multiple clients, normalizes them, prevents double counting, handles partial failures, and exposes aggregated results via an API and UI.

## Features

- **Event Ingestion**: Accepts JSON events with varying schemas, field names, and types
- **Normalization**: Converts raw events to a canonical format with configurable logic
- **Idempotency & Deduplication**: Prevents double counting when events are resent
- **Failure Handling**: Gracefully handles database failures and retries
- **Aggregation API**: Provides aggregated metrics with filtering capabilities
- **React UI**: Interactive interface for submitting events, simulating failures, and viewing results

## Technology Stack

### Backend
- Node.js
- Express.js

### Frontend
- React
- HTML/CSS
- Axios

## Project Structure

```
EventIngestionSystem/
<img width="304" height="398" alt="image" src="https://github.com/user-attachments/assets/36fd8549-82e8-4f6d-bd45-4cba027415c4" />

```

## Setup Instructions

### Prerequisites
- Node.js (v14 or higher)

### Installation

1. **Install backend dependencies:**
```bash
npm install
```

2. **Install frontend dependencies:**
```bash
cd client
npm install
cd ..
```
3. **Start the backend server:**
```bash
npm start
# or for development with auto-reload:
npm run dev
```

4. **Start the frontend** (in a new terminal):
```bash
npm run client
# or:
cd client && npm start
```

The application will be available at:
- Backend API: `http://localhost:5000`
- Frontend UI: `http://localhost:3000`

## **Screenshot**
<img width="1366" height="690" alt="image" src="https://github.com/user-attachments/assets/1d0889ce-1d04-4a03-9685-f4292bbadfef" />
<img width="1366" height="691" alt="image" src="https://github.com/user-attachments/assets/4f7d998f-6d9d-4ea8-b8cf-6cf1b4c87410" />

## API Endpoints

### POST /api/events
Ingest a single event or array of events.

**Query Parameters:**
- `simulateFailure=true` - Simulates a database failure for testing

**Request Body:**
```json
{
  "source": "client_A",
  "payload": {
    "metric": "purchase",
    "amount": "1200",
    "timestamp": "2024/01/01"
  }
}
```

**Response:**
```json
{
  "success": true,
  "processed": 1,
  "failed": 0,
  "results": [...]
}
```

### GET /api/events
Retrieve events with optional filtering.

**Query Parameters:**
- `clientId` - Filter by client ID
- `status` - Filter by status (processed/rejected/failed)
- `startDate` - Filter by start date
- `endDate` - Filter by end date
- `limit` - Number of results (default: 100)
- `skip` - Skip number of results (default: 0)

### GET /api/aggregation
Get aggregated metrics.

**Query Parameters:**
- `clientId` - Filter by client ID
- `startDate` - Filter by start date
- `endDate` - Filter by end date
- `metric` - Filter by metric name
- `groupBy` - Grouping (none/clientId/metric/both)

## Design Decisions & Assumptions

### 1. Event Normalization

**Assumptions:**
- Events may have nested `payload` structure or flat structure
- Client ID may appear as: `source`, `client_id`, `clientId`, `client`, `origin`
- Metric may appear as: `metric`, `event_type`, `type`, `eventType`, `name`
- Amount may appear as: `amount`, `value`, `count`, `quantity`, `total`, `price`
- Timestamp may appear as: `timestamp`, `time`, `date`, `created_at`, `createdAt`, `ts`
- Amount values may be strings or numbers
- Timestamps may be in various formats (ISO, Unix timestamp, custom formats like "2024/01/01")

**Implementation:**
- Normalization service checks multiple possible field names
- Handles type coercion (string numbers to numeric)
- Parses various date formats
- Falls back to defaults (current time for missing timestamps, "unknown" for missing metrics)
- Events that cannot be normalized are marked as "rejected" and stored for audit

### 2. Double-Counting Prevention

**Approach:**
- Uses SHA-256 hash of canonical event fields (clientId, metric, amount, timestamp) as `eventHash`
- Maintains a separate `DeduplicationRecord` collection with unique index on `eventHash`
- Events have a unique index on `eventHash` to prevent duplicates at database level

**Race Condition Handling:**
- Database-level unique constraints prevent duplicate inserts
- If a duplicate insert is attempted, the system detects it and returns the existing event
- Two-phase approach: insert event first, then record in deduplication table
- If deduplication record insert fails due to duplicate, the event is deleted and existing event is returned

**Limitations:**
- Hash collision is theoretically possible but extremely unlikely with SHA-256
- Events with identical normalized fields are considered duplicates (this is by design)
- If timestamp precision is low, events occurring at the same time with same data may be deduplicated

### 3. Behavior on DB Failure Mid-Request

**Scenario:** Event is received and validated, but database write fails, and client retries.

**Implementation:**
- Event normalization happens before any database operations
- If normalization fails, a "rejected" event record is created
- For database failures:
  - If the event hash already exists (from a previous successful write), the system returns the existing event (idempotent)
  - If the write fails and the hash doesn't exist, a "failed" event record is created with error details
  - On retry with the same event:
    - If previous write succeeded, deduplication detects it and returns existing event
    - If previous write failed, a new "failed" record may be created (but won't be counted in aggregations)
  - Aggregations only count events with status="processed"

**Failure Modes:**
1. **Network failure before write**: Event is lost, client must retry
2. **DB failure during event insert**: Event marked as "failed", retry will either find existing (if partially succeeded) or create new failed record
3. **DB failure during dedup record insert**: Event exists but dedup record missing - handled by checking event collection directly

**Improvement Opportunities:**
- Use MongoDB transactions (requires replica set) for atomic operations
- Implement retry logic with exponential backoff
- Use idempotency keys from clients if available

### 4. What Breaks First at Scale

**Bottlenecks identified:**

1. **Hash Collision Checks**
   - Sequential duplicate checks for each event add latency
   - At high volume, checking deduplication records becomes expensive
   - Solution: In-memory cache (Redis) for recent hashes, batch operations

2. **Normalization Complexity**
   - Multiple field name checks per event increase CPU usage
   - Solution: Pre-compile field mappings, use more efficient parsing

3. **Memory Usage**
   - Storing original payloads increases storage requirements
   - Large number of events in memory during aggregation
   - Solution: Archive old events, pagination, streaming aggregation

4. **Network & API Limits**
   - Single Express server will hit connection limits
   - No rate limiting currently
   - Solution: Load balancers, API gateway, rate limiting middleware

5. **Frontend Performance**
   - Loading all events into UI will become slow
   - Solution: Pagination, virtual scrolling, server-side filtering

**Scalability Improvements:**
- Add Redis for caching and distributed locking
- Implement message queue (RabbitMQ/Kafka) for async processing
- Separate read/write databases
- Add connection pooling and database connection limits
- Implement batch processing for high-volume ingestion
- Add monitoring and alerting (Prometheus, Grafana)

## Testing

### Manual Testing Examples

**Example 1: Basic Event Submission**
```json
{
  "source": "client_A",
  "payload": {
    "metric": "purchase",
    "amount": "1200",
    "timestamp": "2024/01/01"
  }
}
```

**Example 2: Flat Structure**
```json
{
  "client_id": "client_B",
  "event_type": "click",
  "value": 500,
  "date": "2024-01-15T10:30:00Z"
}
```

**Example 3: Testing Deduplication**
Submit the same event twice - second submission should return existing event with `isDuplicate: true`.

**Example 4: Testing Failure Handling**
Submit an event with `?simulateFailure=true` query parameter to test failure scenario.

## Future Enhancements

- Authentication and authorization
- Rate limiting and throttling
- Webhook notifications for failed events
- Event schema validation rules configuration
- Real-time event streaming
- Advanced analytics and visualization
- Event archiving and retention policies
- Multi-tenant support with isolation

## License

ISC


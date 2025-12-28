# Quick Start Guide

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   cd client
   npm install
   cd ..
   ```

2. **Configure environment** (optional - defaults work for local development):
   Create `.env` file:
   ```
   PORT=5000
   ```

3. **Start the backend:**
   ```bash
   npm start
   ```

5. **Start the frontend** (in a new terminal):
   ```bash
   cd client
   npm start
   ```

## Testing

### Using the UI (http://localhost:3000)

1. **Submit a basic event:**
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

2. **Test deduplication:** Submit the same event twice. The second submission should return the existing event.

3. **Test failure handling:** Check the "Simulate Database Failure" checkbox and submit an event to see how failures are handled.

4. **View aggregated results:** Use the filters to see aggregated metrics grouped by client, metric, or time range.

### Using curl

**Submit an event:**
```bash
curl -X POST http://localhost:5000/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "source": "client_A",
    "payload": {
      "metric": "purchase",
      "amount": "1200",
      "timestamp": "2024/01/01"
    }
  }'
```

**Get events:**
```bash
curl http://localhost:5000/api/events?status=processed&limit=10
```

**Get aggregation:**
```bash
curl http://localhost:5000/api/aggregation?clientId=client_A&groupBy=metric
```

## Example Events

See `examples/test-events.json` for example event formats that the system can handle.


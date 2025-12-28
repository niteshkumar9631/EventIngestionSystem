const express = require('express');
const cors = require('cors');
require('dotenv').config();

const eventRoutes = require('./routes/events');
const aggregationRoutes = require('./routes/aggregation');
const fileStorage = require('./storage/fileStorage');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/events', eventRoutes);
app.use('/api/aggregation', aggregationRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize file storage and start server
fileStorage.initialize()
  .then(() => {
    console.log('File storage initialized');
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Storage initialization error:', error);
    process.exit(1);
  });

module.exports = app;


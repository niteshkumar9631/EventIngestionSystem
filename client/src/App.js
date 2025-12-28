import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './index.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function App() {
  const [eventJson, setEventJson] = useState('');
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [events, setEvents] = useState([]);
  const [aggregation, setAggregation] = useState(null);
  const [filters, setFilters] = useState({
    clientId: '',
    status: 'all',
    startDate: '',
    endDate: '',
  });
  const [aggFilters, setAggFilters] = useState({
    clientId: '',
    startDate: '',
    endDate: '',
    metric: '',
    groupBy: 'none',
  });

  // Load events and aggregation on mount
  useEffect(() => {
    fetchEvents();
    fetchAggregation();
  }, []);

  const fetchEvents = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.clientId) params.append('clientId', filters.clientId);
      if (filters.status !== 'all') params.append('status', filters.status);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);

      const response = await axios.get(`${API_BASE_URL}/events?${params.toString()}`);
      setEvents(response.data.events || []);
    } catch (error) {
      console.error('Error fetching events:', error);
      setMessage({ type: 'error', text: 'Failed to fetch events' });
    }
  };

  const fetchAggregation = async () => {
    try {
      const params = new URLSearchParams();
      if (aggFilters.clientId) params.append('clientId', aggFilters.clientId);
      if (aggFilters.startDate) params.append('startDate', aggFilters.startDate);
      if (aggFilters.endDate) params.append('endDate', aggFilters.endDate);
      if (aggFilters.metric) params.append('metric', aggFilters.metric);
      if (aggFilters.groupBy) params.append('groupBy', aggFilters.groupBy);

      const response = await axios.get(`${API_BASE_URL}/aggregation?${params.toString()}`);
      setAggregation(response.data);
    } catch (error) {
      console.error('Error fetching aggregation:', error);
      setMessage({ type: 'error', text: 'Failed to fetch aggregation' });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      let parsedEvent;
      try {
        parsedEvent = JSON.parse(eventJson);
      } catch (error) {
        setMessage({ type: 'error', text: 'Invalid JSON format' });
        setLoading(false);
        return;
      }

      const url = `${API_BASE_URL}/events${simulateFailure ? '?simulateFailure=true' : ''}`;
      const response = await axios.post(url, parsedEvent);

      if (response.data.success) {
        setMessage({
          type: 'success',
          text: `Successfully processed ${response.data.processed} event(s). ${response.data.failed > 0 ? `${response.data.failed} failed.` : ''}`,
        });
        setEventJson('');
        // Refresh events and aggregation
        fetchEvents();
        fetchAggregation();
      } else {
        setMessage({ type: 'error', text: response.data.error || 'Failed to process event' });
      }
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message || 'Failed to submit event';
      setMessage({ type: 'error', text: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = () => {
    fetchEvents();
  };

  const handleAggFilterChange = () => {
    fetchAggregation();
  };

  const getStatusBadge = (status) => {
    const badges = {
      processed: 'badge-success',
      rejected: 'badge-danger',
      failed: 'badge-warning',
    };
    return badges[status] || '';
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="container">
      <div className="header">
        <h1>Event Ingestion System</h1>
        <p>Fault-tolerant event processing with normalization and deduplication</p>
      </div>

      {message && (
        <div className={`alert alert-${message.type === 'error' ? 'error' : 'success'}`}>
          {message.text}
        </div>
      )}

      {/* Event Submission Form */}
      <div className="card">
        <h2>Submit Event</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="eventJson">Event JSON:</label>
            <textarea
              id="eventJson"
              value={eventJson}
              onChange={(e) => setEventJson(e.target.value)}
              placeholder={`Example:\n{\n  "source": "client_A",\n  "payload": {\n    "metric": "purchase",\n    "amount": "1200",\n    "timestamp": "2024/01/01"\n  }\n}`}
              required
            />
          </div>
          <div className="checkbox-group">
            <input
              type="checkbox"
              id="simulateFailure"
              checked={simulateFailure}
              onChange={(e) => setSimulateFailure(e.target.checked)}
            />
            <label htmlFor="simulateFailure">Simulate Database Failure</label>
          </div>
          <button type="submit" className="button" disabled={loading}>
            {loading ? 'Processing...' : 'Submit Event'}
          </button>
        </form>
      </div>

      {/* Aggregation Results */}
      <div className="card">
        <h2>Aggregated Results</h2>
        <div className="filters">
          <input
            type="text"
            placeholder="Client ID"
            value={aggFilters.clientId}
            onChange={(e) => setAggFilters({ ...aggFilters, clientId: e.target.value })}
            onBlur={handleAggFilterChange}
          />
          <input
            type="text"
            placeholder="Metric"
            value={aggFilters.metric}
            onChange={(e) => setAggFilters({ ...aggFilters, metric: e.target.value })}
            onBlur={handleAggFilterChange}
          />
          <input
            type="date"
            placeholder="Start Date"
            value={aggFilters.startDate}
            onChange={(e) => setAggFilters({ ...aggFilters, startDate: e.target.value })}
            onBlur={handleAggFilterChange}
          />
          <input
            type="date"
            placeholder="End Date"
            value={aggFilters.endDate}
            onChange={(e) => setAggFilters({ ...aggFilters, endDate: e.target.value })}
            onBlur={handleAggFilterChange}
          />
          <select
            value={aggFilters.groupBy}
            onChange={(e) => {
              setAggFilters({ ...aggFilters, groupBy: e.target.value });
              setTimeout(handleAggFilterChange, 100);
            }}
          >
            <option value="none">No Grouping</option>
            <option value="clientId">Group by Client</option>
            <option value="metric">Group by Metric</option>
            <option value="both">Group by Client & Metric</option>
          </select>
        </div>

        {aggregation && (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <h3>{aggregation.statistics?.totalProcessed || 0}</h3>
                <p>Processed Events</p>
              </div>
              <div className="stat-card">
                <h3>{aggregation.statistics?.rejected || 0}</h3>
                <p>Rejected Events</p>
              </div>
              <div className="stat-card">
                <h3>{aggregation.statistics?.failed || 0}</h3>
                <p>Failed Events</p>
              </div>
            </div>

            {aggregation.aggregation && (
              <div className="json-preview">
                <h3>Aggregation Data:</h3>
                <pre>{JSON.stringify(aggregation.aggregation, null, 2)}</pre>
              </div>
            )}
          </>
        )}
      </div>

      {/* Events List */}
      <div className="card">
        <h2>Events ({events.length})</h2>
        <div className="filters">
          <input
            type="text"
            placeholder="Filter by Client ID"
            value={filters.clientId}
            onChange={(e) => setFilters({ ...filters, clientId: e.target.value })}
            onBlur={handleFilterChange}
          />
          <select
            value={filters.status}
            onChange={(e) => {
              setFilters({ ...filters, status: e.target.value });
              setTimeout(handleFilterChange, 100);
            }}
          >
            <option value="all">All Status</option>
            <option value="processed">Processed</option>
            <option value="rejected">Rejected</option>
            <option value="failed">Failed</option>
          </select>
          <input
            type="date"
            placeholder="Start Date"
            value={filters.startDate}
            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
            onBlur={handleFilterChange}
          />
          <input
            type="date"
            placeholder="End Date"
            value={filters.endDate}
            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
            onBlur={handleFilterChange}
          />
          <button className="button button-secondary" onClick={fetchEvents}>
            Refresh
          </button>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Client ID</th>
                <th>Metric</th>
                <th>Amount</th>
                <th>Timestamp</th>
                <th>Status</th>
                <th>Processed At</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '40px' }}>
                    No events found
                  </td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr key={event._id}>
                    <td>{event.clientId}</td>
                    <td>{event.metric}</td>
                    <td>{event.amount}</td>
                    <td>{formatDate(event.timestamp)}</td>
                    <td>
                      <span className={`badge ${getStatusBadge(event.status)}`}>
                        {event.status}
                      </span>
                    </td>
                    <td>{formatDate(event.processedAt)}</td>
                    <td>{event.rejectionReason || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default App;


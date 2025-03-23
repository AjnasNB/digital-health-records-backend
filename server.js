const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const bodyParser = require('body-parser');
require('dotenv').config();

// Import routes
const userRoutes = require('./routes/userRoutes');
const healthRecordRoutes = require('./routes/healthRecordRoutes');

// Initialize Express
const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Define routes
app.use('/api/users', userRoutes);
app.use('/api/health-records', healthRecordRoutes);

// Basic route for testing
app.get('/', (req, res) => {
  res.json({ message: 'Digital Health Records API is running...' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  // Handle multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      message: 'File too large. Maximum file size is 10MB.',
    });
  }
  
  res.status(500).json({
    message: err.message || 'Something went wrong on the server',
  });
});

// Set port and start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 
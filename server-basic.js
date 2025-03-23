// Basic Express server for testing
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.json({ message: 'Digital Health Records API is running!' });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log('Server is running on port ' + PORT);
}); 
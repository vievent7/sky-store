const express = require('express');
const path = require('path');

const app = express();
const PORT = 3001;

// Serve d3-celestial and its lib from parent's node_modules
app.use('/celestial', express.static(path.join(__dirname, '../node_modules/d3-celestial')));
app.use('/d3-lib', express.static(path.join(__dirname, '../node_modules/d3-celestial/lib')));

// Serve the test page
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`d3-celestial test server running at http://localhost:${PORT}`);
  console.log(`Celestial files: http://localhost:${PORT}/celestial/celestial.js`);
  console.log(`Test page:       http://localhost:${PORT}/`);
});

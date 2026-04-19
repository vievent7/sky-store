const express = require('express');
const path = require('path');

const app = express();
const PORT = 3002;

const PUBLIC_PATH = path.join(__dirname, 'public');

// Serve static files from local public folder
app.use(express.static(PUBLIC_PATH));

app.listen(PORT, () => {
  console.log('==========================================');
  console.log('  Celestial Sphere - Reserve Copy');
  console.log('  Running at: http://localhost:' + PORT);
  console.log('  Open:       http://localhost:' + PORT + '/index.html');
  console.log('==========================================');
  console.log('');
  console.log('Controls:');
  console.log('  Left-click + drag  -> rotate sphere');
  console.log('  Scroll wheel       -> zoom');
  console.log('  Right-click + drag -> pan');
  console.log('');
  console.log('Buttons:');
  console.log('  Vue par defaut          -> reset view');
  console.log('  Afficher/Masquer...     -> toggle layers');
  console.log('');
  console.log('Note: All files are local (no external dependencies).');
  console.log('');
});

require('dotenv').config({ path: 'C:/Users/vieve/.openclaw/workspace/sky-store/.env' });
const { getSessionStatus } = require('./services/stripe-service');
const sessionId = process.argv[2] || 'cs_test_a1Sbpt2RCVsFY';

console.log('Testing getSessionStatus for:', sessionId);
getSessionStatus(sessionId)
    .then(r => {
        console.log('Result:', JSON.stringify(r));
        process.exit(0);
    })
    .catch(e => {
        console.error('Error:', e.message);
        process.exit(1);
    });

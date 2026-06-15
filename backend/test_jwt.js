const jwt = require('jsonwebtoken');
require('dotenv').config();

console.log('JWT_SECRET:', process.env.JWT_SECRET);

// Create a token like the login does
const token = jwt.sign(
  { userId: 'test-user-id' },
  process.env.JWT_SECRET,
  { expiresIn: '24h' }
);
console.log('Created token:', token);

// Verify the token immediately
try {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  console.log('Verified OK:', decoded);
} catch (err) {
  console.log('Verify error:', err.message);
}

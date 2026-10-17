const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const app = require('./app');
const connectDB = require('./config/db');

async function startServer() {
  try {
    await connectDB();
  } catch (error) {
    console.error('Unable to start API server because MongoDB is unavailable:', error);
    process.exit(1);
    return;
  }

  const port = process.env.PORT || 5000;
  const server = app.listen(port, () => {
    console.log(`API server listening on port ${port}.`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Set a different PORT in backend/.env or stop the process using it.`);
    } else {
      console.error('Unable to start API server:', error);
    }
    process.exit(1);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = app;

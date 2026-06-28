/**
 * Application entry point.
 */
const app = require('./src/app');
const config = require('./config/env');

const server = app.listen(config.port, () => {
  console.log(`Missed Call Capture running on http://localhost:${config.port} (pid ${process.pid})`);
  console.log(`Dashboard:  http://localhost:${config.port}/dashboard`);
  console.log(`Health:     http://localhost:${config.port}/health`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${config.port} is already in use. Stop the other process first:`);
    console.error(`  lsof -i :${config.port}`);
    console.error(`  kill <PID>`);
  } else {
    console.error('Server failed to start:', err.message);
  }
  process.exit(1);
});

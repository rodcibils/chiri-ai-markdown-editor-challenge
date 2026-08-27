import { createApp } from './app.js';
import { loadServerConfig } from './config.js';
import { createOpenRouterClient } from './openRouterClient.js';

/** Starts the production API/static server with server-only configuration. */
function startServer(): void {
  const config = loadServerConfig();
  const app = createApp(createOpenRouterClient(config), { serveStatic: true });

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`Chiri server listening on http://127.0.0.1:${config.port}`);
  });
}

startServer();

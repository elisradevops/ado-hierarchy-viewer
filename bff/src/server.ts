import { createApp } from './app';
import { config } from './config';
import { logger } from './utils/logger';

const app = createApp();

app.listen(config.PORT, () => {
  logger.info('BFF server started', { port: config.PORT });
});

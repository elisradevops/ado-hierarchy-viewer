import pLimit from 'p-limit';
import { config } from '../config';

export const adoConcurrencyLimit = pLimit(config.ADO_CONCURRENCY);

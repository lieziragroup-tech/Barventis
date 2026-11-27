import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';

export default {
  targets: [{
    engine: web(),
    app: {
      url: process.env.APP_URL ?? 'http://localhost:5173',
      command: { executable: 'npm', args: ['run', 'dev'], log: '.e2e/logs/app.log' },
    },
  }],
} satisfies E2EConfig;

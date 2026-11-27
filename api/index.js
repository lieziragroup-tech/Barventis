// Vercel Serverless Function Entrypoint (ESM-compatible with package.json "type": "module")
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createApp } = require('../dist/server.cjs');

const app = createApp();
export default app;

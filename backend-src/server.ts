import 'dotenv/config';
import { createApp } from './app.js';
import path from 'path';
import express from 'express';

async function startServer() {
  const port = Number(process.env.PORT || 3000);
  const app = createApp();

  if (process.env.NODE_ENV !== 'production') {
    // Dynamic import: `vite` adalah devDependency, tidak boleh ikut ter-require di bundle produksi/serverless.
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`[fieldwork-api] listening on http://localhost:${port}`);
  });
}


// Only start the server if run directly (not imported as a module in serverless)
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  startServer();
}

// Export for serverless environments
export { createApp };

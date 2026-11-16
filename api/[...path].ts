import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Express } from 'express';
import { createExpressApp } from '../server/app.ts';

let appPromise: Promise<Express> | null = null;

function getApp(): Promise<Express> {
  if (!appPromise) {
    appPromise = createExpressApp();
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp();
  return app(req as Parameters<Express>[0], res as Parameters<Express>[1]);
}

import type { Request, Response } from 'express';

let appPromise: Promise<typeof import('../server/src/app.js')> | undefined;

export default async function handler(req: Request, res: Response) {
  const { default: app } = await (appPromise ??= import('../server/src/app.js'));
  app(req, res);
}

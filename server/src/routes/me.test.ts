import type { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import meRouter from './me.js';

const app = express();
app.use(express.json());
app.use('/api/me', meRouter);
let base = '';
let server: ReturnType<typeof app.listen>;

beforeAll(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/me`;
});
afterAll(() => {
  server.close();
});

describe('/api/me', () => {
  it('remembers a team ID in a long-lived first-party cookie', async () => {
    const res = await fetch(base, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ teamId: 186934 }) });
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^fpl_team=186934;/);
    expect(cookie).toMatch(/Max-Age=34560000/);
    expect(cookie).toMatch(/HttpOnly/);

    const me = await fetch(base, { headers: { cookie: 'other=1; fpl_team=186934' } });
    expect(await me.json()).toEqual({ teamId: 186934 });
  });

  it('rejects invalid IDs and forgets on delete', async () => {
    const bad = await fetch(base, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ teamId: 'abc' }) });
    expect(bad.status).toBe(400);
    const del = await fetch(base, { method: 'DELETE' });
    expect(del.headers.get('set-cookie')).toMatch(/fpl_team=;/);
    expect(await (await fetch(base)).json()).toEqual({ teamId: null });
  });
});

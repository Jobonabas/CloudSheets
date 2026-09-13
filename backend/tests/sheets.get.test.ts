/// <reference types="vitest" />
import { beforeAll, describe, it } from 'vitest';
import request from 'supertest';
import assert from 'assert';
import type { Sheet } from '../src/interfaces/sheet.ts'
import { randomUUID } from 'crypto';

const address = process.env.TEST_SERVER_URL ?? 'http://127.0.0.1:8080';

let db: any;
beforeAll(async () => {
  const { default: setupDB } = await import('./setup.ts');
  db = await setupDB();
});

describe('Sheets API - GET', () => {
  it('should list all sheets (GET /sheets)', async () => {
    // Clean up before test
    await db('permissions').where({ user_id: 'demo-user-id' }).del();
    await db('sheets').where({ owner_id: 'demo-user-id' }).del();

    // Insert a sheet owned by demo-user-id
    const userSheetId = randomUUID();
    await db('sheets').insert({
      id: userSheetId,
      title: 'User Sheet',
      owner_id: 'demo-user-id',
      yjs_snapshot: Buffer.from('user').toString('base64'),
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    });

    // Insert a sheet owned by another user and grant viewer permission to demo-user-id
    const sharedSheetId = randomUUID();
    await db('sheets').insert({
      id: sharedSheetId,
      title: 'Shared Sheet',
      owner_id: 'demo-user-2',
      yjs_snapshot: Buffer.from('shared').toString('base64'),
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    });
    await db('permissions').insert({
      sheet_id: sharedSheetId,
      user_id: 'demo-user-id',
      role: 'viewer'
    });

    const res = await request(address)
      .get('/sheets')
      .expect('Content-Type', /json/)
      .expect(200);
    assert.strictEqual(typeof res.body.message, 'string');
    assert.strictEqual(typeof res.body.success, 'boolean');
    assert(Array.isArray(res.body.userSheets));
    assert(Array.isArray(res.body.sharedSheets));
    // Optionally, check that the inserted sheets are present
    const userIds = res.body.userSheets.map((sheet: Sheet) => sheet.id);
    const sharedIds = res.body.sharedSheets.map((sheet: Sheet) => sheet.id);
    assert(userIds.includes(userSheetId));
    assert(sharedIds.includes(sharedSheetId));

    // Clean up after test
    await db('permissions').where({ user_id: 'demo-user-id' }).del();
    await db('sheets').whereIn('id', [userSheetId, sharedSheetId]).del();
  });

  it('should return 404 if sheets not found (GET /sheets)', async () => {
    await db('permissions').where({ user_id: 'demo-user-id' }).del();
    await db('sheets').where({ owner_id: 'demo-user-id' }).del();

    const res = await request(address)
      .get('/sheets')
      .expect('Content-Type', /json/)
      .expect(404);
    assert.strictEqual(typeof res.body.message, 'string');
  });
});

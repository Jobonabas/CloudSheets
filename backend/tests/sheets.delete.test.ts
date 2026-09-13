/// <reference types="vitest" />
import { beforeAll, describe, it } from 'vitest';
import request from 'supertest';
import assert from 'assert';
import { randomUUID } from 'crypto';

const address = process.env.TEST_SERVER_URL ?? 'http://127.0.0.1:8080';

let db: any;
beforeAll(async () => {
  const { default: setupDB } = await import('./setup.ts');
  db = await setupDB();
});

describe('Sheets API - DELETE', () => {
  it('should delete a sheet (DELETE /sheets/:id)', async () => {
    // Insert a sheet directly into the db
    const sheetId = randomUUID()
    await db('sheets').insert({
      id: sheetId,
      title: 'Sheet to Delete',
      owner_id: 'demo-user-id',
      yjs_snapshot: Buffer.from('delete').toString('base64'),
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    });
    const res = await request(address)
      .delete(`/sheets/${sheetId}`)
      .expect('Content-Type', /json/)
      .expect(200);
    assert.strictEqual(typeof res.body.message, 'string');
    assert.strictEqual(res.body.success, true);
    // Clean up (should be deleted, but just in case)
    await db('sheets').where({ id: sheetId }).del();
  });

  it('should return 400 if id malformed (DELETE /sheets/:id)', async () => {
    const res = await request(address)
      .delete('/sheets/nonexistent-id')
      .expect('Content-Type', /json/)
      .expect(400);
    assert.strictEqual(typeof res.body.message, 'string');
    assert.strictEqual(res.body.success, false);
  });

  it('should return 404 if sheet not found (DELETE /sheets/:id)', async () => {
    const missingId = randomUUID();
    const res = await request(address)
      .delete(`/sheets/${missingId}`)
      .expect('Content-Type', /json/)
      .expect(404);
    assert.strictEqual(typeof res.body.message, 'string');
    assert.strictEqual(res.body.success, false);
  });
});

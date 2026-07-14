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

describe('Sheets API - SHARE', () => {
  it('should set permissions for another user (POST /sheets/:id/share)', async () => {
    // Insert a sheet directly into the db
    const sheetId = randomUUID();
    await db('sheets').insert({
      id: sheetId,
      title: 'Sheet to Share',
      owner_id: 'demo-user-id',
      yjs_snapshot: Buffer.from('share').toString('base64'),
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    });
    const sharePayload = {
      id: sheetId,
      email: 'demo2@example.com',
      role: 'viewer'
    };
    const res = await request(address)
      .post(`/sheets/${sheetId}/share`)
      .send(sharePayload)
      .expect('Content-Type', /json/)
      .expect(200);
    assert.strictEqual(typeof res.body.message, 'string');
    assert.strictEqual(res.body.success, true);
    // Clean up
    await db('permissions').where({ sheet_id: sheetId, user_id: 'demo-user-2' }).del();
    await db('sheets').where({ id: sheetId }).del();
  });

  it('should return 400 if user already has this permission (POST /sheets/:id/share)', async () => {
    // Insert a sheet and permission directly into the db
    const sheetId = randomUUID();
    await db('sheets').insert({
      id: sheetId,
      title: 'Sheet to Share',
      owner_id: 'demo-user-id',
      yjs_snapshot: Buffer.from('share').toString('base64'),
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    });
    await db('permissions').insert({
      sheet_id: sheetId,
      user_id: 'demo-user-2',
      role: 'viewer'
    });
    const sharePayload = {
      id: sheetId,
      email: 'demo2@example.com',
      role: 'viewer'
    };
    const res = await request(address)
      .post(`/sheets/${sheetId}/share`)
      .send(sharePayload)
      .expect('Content-Type', /json/)
      .expect(400);
    assert.strictEqual(typeof res.body.message, 'string');
    assert.strictEqual(res.body.success, false);
    // Clean up
    await db('permissions').where({ sheet_id: sheetId, user_id: 'demo-user-2' }).del();
    await db('sheets').where({ id: sheetId }).del();
  });

  it('should return 403 if permission denied (POST /sheets/:id/share)', async () => {
    // Insert a sheet owned by another user (demo-user-2), no editor permission for demo-user-id meaning he cant share it
    const forbiddenSheetId = randomUUID();
    await db('sheets').insert({
      id: forbiddenSheetId,
      title: 'Forbidden Share Sheet',
      owner_id: 'demo-user-2',
      yjs_snapshot: Buffer.from('forbidden-share').toString('base64'),
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    });

    // Try to share as demo-user-id (should fail, not owner and no editor permission)
    const sharePayload = {
      id: forbiddenSheetId,
      email: 'demo@example.com',
      role: 'viewer'
    };
    const res = await request(address)
      .post(`/sheets/${forbiddenSheetId}/share`)
      .send(sharePayload)
      .expect('Content-Type', /json/)
      .expect(403);
    assert.strictEqual(typeof res.body.message, 'string');
    assert.strictEqual(res.body.success, false);

    // Clean up
    await db('sheets').where({ id: forbiddenSheetId }).del();
  });

  it('should return 400 if id malformed (POST /sheets/:id/share)', async () => {
    const sharePayload = {
      id: 'nonexistent-id',
      email: 'demo@example.com',
      role: 'viewer'
    };
    const res = await request(address)
      .post('/sheets/nonexistent-id/share')
      .send(sharePayload)
      .expect('Content-Type', /json/)
      .expect(400);
    assert.strictEqual(typeof res.body.message, 'string');
    assert.strictEqual(res.body.success, false);
  });

  it('should return 404 if sheet not found (POST /sheets/:id/share)', async () => {
    const sharePayload = {
      id: randomUUID(),
      email: 'demo@example.com',
      role: 'viewer'
    };
    const res = await request(address)
      .post(`/sheets/${sharePayload.id}/share`)
      .send(sharePayload)
      .expect('Content-Type', /json/)
      .expect(404);
    assert.strictEqual(typeof res.body.message, 'string');
    assert.strictEqual(res.body.success, false);
  });
});

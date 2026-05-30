const db = require('../src/db.ts');
const request = require('supertest');
const assert = require('assert');
import type { Sheet } from '../src/interfaces/sheet.ts'

const address = 'http://127.0.0.1:8080'
// - **GET** `/sheets` — List all sheets
// - **POST** `/sheets` — Create a new sheet
// - **DELETE** `/sheets/:id` - Delete a sheet
// - **GET (WebSocket)** `/sheets/:id/sync` — WebSocket endpoint for real-time sheet sync (requires ownership or permission)
// - **POST (Permissions)** `/sheets/:id/share` - Set other users view/edit permissions for sheet using their email address

//seed demo users before tests
beforeAll(async () => {
  await require('../seeds/development/01_demo_user').seed(db);
});

describe('Sheets API', () => {
  // GET /sheets
  it('should list all sheets (GET /sheets)', async () => {
    // Clean up before test
    await db('permissions').where({ user_id: 'demo-user-id' }).del();
    await db('sheets').where({ owner_id: 'demo-user-id' }).del();

    // Insert a sheet owned by demo-user-id
    const userSheetId = uuidv4();
    await db('sheets').insert({
      id: userSheetId,
      title: 'User Sheet',
      owner_id: 'demo-user-id',
      yjs_snapshot: Buffer.from('user').toString('base64'),
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    });

    // Insert a sheet owned by another user and grant permission to demo-user-id
    const sharedSheetId = uuidv4();
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
    // Clean up all sheets and permissions for demo-user-id to emulate case where there are no sheets found for this user
    await db('permissions').where({ user_id: 'demo-user-id' }).del();
    await db('sheets').where({ owner_id: 'demo-user-id' }).del();

    const res = await request(address)
      .get('/sheets')
      .expect('Content-Type', /json/)
      .expect(404);
    assert.strictEqual(typeof res.body.message, 'string');
  });

  // POST /sheets
  // Generate UUID Method
  const uuidv4 = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });

  it('should create a new sheet (POST /sheets)', async () => {
    const payload = {
      title: 'Test Sheet',
      id: uuidv4(),
      yjs_snapshot: Buffer.from('test').toString('base64'),
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    };
    const res = await request(address)
      .post('/sheets')
      .send(payload)
      .expect('Content-Type', /json/)
      .expect(200);
    assert.strictEqual(typeof res.body.message, 'string');
    assert.strictEqual(res.body.success, true);
  });

  it('should not allow invalid requests (POST /sheets)', async () => {
    const res = await request(address)
      .post('/sheets')
      .send({})
      .expect('Content-Type', /json/)
      .expect(400);
    assert.strictEqual(typeof res.body.message, 'string');
    assert.strictEqual(res.body.success, false);
  });

  // DELETE /sheets/:id
  it('should delete a sheet (DELETE /sheets/:id)', async () => {
    // Insert a sheet directly into the db
    const sheetId = uuidv4();
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

  it('should return 404 if sheet not found (DELETE /sheets/:id)', async () => {
    const res = await request(address)
      .delete('/sheets/nonexistent-id')
      .expect('Content-Type', /json/)
      .expect(404);
    assert.strictEqual(typeof res.body.message, 'string');
    assert.strictEqual(res.body.success, false);
  });

  it('should return 403 if permission denied (DELETE /sheets/:id)', async () => {
    // Insert a sheet owned by another user
    const forbiddenSheetId = uuidv4();
    await db('sheets').insert({
      id: forbiddenSheetId,
      title: 'Forbidden Sheet',
      owner_id: 'demo-user-2',
      yjs_snapshot: Buffer.from('forbidden').toString('base64'),
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    });

    const res = await request(address)
      .delete(`/sheets/${forbiddenSheetId}`)
      .expect('Content-Type', /json/)
      .expect(403);
    assert.strictEqual(typeof res.body.message, 'string');
    assert.strictEqual(res.body.success, false);

    // Clean up
    await db('sheets').where({ id: forbiddenSheetId }).del();
  });

  // POST /sheets/:id/share
  it('should set permissions for another user (POST /sheets/:id/share)', async () => {
    // Insert a sheet directly into the db
    const sheetId = uuidv4();
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

  it('should return 403 if permission denied (POST /sheets/:id/share)', async () => {
    // Insert a sheet owned by another user (demo-user-2), no editor permission for demo-user-id meaning he cant share it
    const forbiddenSheetId = uuidv4();
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

  it('should return 404 if sheet not found (POST /sheets/:id/share)', async () => {
    const sharePayload = {
      id: 'nonexistent-id',
      email: 'demo@example.com',
      role: 'viewer'
    };
    const res = await request(address)
      .post('/sheets/nonexistent-id/share')
      .send(sharePayload)
      .expect('Content-Type', /json/)
      .expect(404);
    assert.strictEqual(typeof res.body.message, 'string');
    assert.strictEqual(res.body.success, false);
  });

  // Health endpoints
  it('should return ok for health (GET /health)', async () => {
    const res = await request(address)
      .get('/health')
      .expect('Content-Type', /json/)
      .expect(200);
    assert.strictEqual(typeof res.body.message, 'string');
  });

  it('should return pong for ping (GET /ping)', async () => {
    const res = await request(address)
      .get('/ping')
      .expect('Content-Type', /json/)
      .expect(200);
    assert.strictEqual(typeof res.body.message, 'string');
  });

  // WebSocket endpoint test (basic connection)
  // This requires a WebSocket client and is best tested with a library like ws or superwstest
  // Skipping implementation unless WebSocket test infra is available
});
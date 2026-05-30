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

describe('Sheets API - POST', () => {
  it('should create a new sheet (POST /sheets)', async () => {
    const payload = {
      title: 'Test Sheet',
      id: randomUUID(),
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

  it('should not allow invalid requests like missing id (POST /sheets)', async () => {
    const res = await request(address)
      .post('/sheets')
      .send({})
      .expect('Content-Type', /json/)
      .expect(400);
    assert.strictEqual(typeof res.body.message, 'string');
    assert.strictEqual(res.body.success, false);
  });
});

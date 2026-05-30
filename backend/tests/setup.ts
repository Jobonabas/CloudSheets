/// <reference types="vitest" />
import db from '../src/db.ts';

export default async function setupDB() {
  // Run migrations and seed demo users
  await db.migrate.latest();
  const seedMod = await import('../seeds/development/01_demo_user.ts');
  await seedMod.seed(db);
  return db;
}

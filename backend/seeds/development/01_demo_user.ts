import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  // Deletes ALL existing demo users
  await knex('users').where({ id: 'demo-user-id' }).del();
  await knex('users').where( { id: 'demo-user-2'}).del();

  // Inserts demo user
  await knex('users').insert({
    id: 'demo-user-id',
    email: 'demo@example.com',
    created_at: new Date()
  });

  await knex('users').insert({
    id: 'demo-user-2',
    email: 'demo2@example.com',
    created_at: new Date()
  });
}
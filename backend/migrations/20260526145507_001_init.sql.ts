import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
  // Users table
  await knex.schema.createTable('users', table => {
    table.string('id').primary(); // matching Cognito ID
    table.string('email').notNullable().unique();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Sheets table
  await knex.schema.createTable('sheets', table => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('title').notNullable();
    table.string('owner_id').notNullable()
        .references('id').inTable('users') // FK to user id
        .onDelete('CASCADE') // deletes associated sheets with user
        .index(); // create index on user_id due to frequent user sheets calls
    table.binary('yjs_snapshot');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // Permissions table
  await knex.schema.createTable('permissions', table => {
    table.increments('id').primary();
    table.uuid('sheet_id').notNullable()
        .references('id').inTable('sheets') // FK to sheets id
        .onDelete('CASCADE')
        .index(); // create index on sheet_id due to frequent permission checks
    table.string('user_email').notNullable();
    table.enu('role', ['editor', 'viewer']).notNullable(); // enum roles
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.unique(['sheet_id', 'user_email']); // Unique Index
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('permissions');
  await knex.schema.dropTableIfExists('sheets');
  await knex.schema.dropTableIfExists('users');
}


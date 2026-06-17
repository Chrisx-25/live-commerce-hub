import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn('Employee', 'anchor_id');
  if (!hasCol) {
    await knex.schema.alterTable('Employee', (t) => {
      t.string('anchor_id', 32).references('anchor_id').inTable('Anchor');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn('Employee', 'anchor_id');
  if (hasCol) {
    await knex.schema.alterTable('Employee', (t) => {
      t.dropColumn('anchor_id');
    });
  }
}

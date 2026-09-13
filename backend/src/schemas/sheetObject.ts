export const SheetObject = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    owner_id: { type: 'string' },
    yjs_snapshot: { type: 'string', nullable: true },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' }
  },
  required: ['id', 'title', 'owner_id', 'created_at', 'updated_at']
};
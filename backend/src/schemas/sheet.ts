export const GETSheetSchema = {
  description: 'List all sheets',
  tags: ['Sheets'],
  response: {
    200: {
      type: 'object',
      properties: {
        message: {type: 'string'},
        success: { type: 'boolean' },
        data: {
          type: 'array',
          items: {
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
          }
        }
      }
    }
  } 
};

export const POSTSheetSchema = {
  description: 'Create a new sheet',
  tags: ['Sheets'],
  body: {
    type: 'object',
    required: ['title', 'id', 'updated_at', 'created_at'],
    properties: {
      title: { type: 'string' },
      id: { type: 'string' },
      yjs_snapshot: { type: 'string', contentEncoding: 'base64' },
      updated_at: { type: 'string', format: 'date-time' },
      created_at: { type: 'string', format: 'date-time' }
    }
  },
  response: {
    200: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        success: { type: 'boolean' },
        data: { type: 'object', properties: {} }
      }
    }
  }
};

export const DELETESheetSchema = {
  description: 'Delete sheet with id',
  tags: ['Sheets'],
  response: {
    200: {
      type: 'object',
      properties: {
        message: {type: 'string'},
        success: { type: 'boolean' },
        data: {type: 'array', items: {type: 'object'}}
      }
    }
  }
};

export const SHARESheetSchema = {
  description: 'Set other users view/edit permissions',
  tags: ['Sheets'],
  body: {
    type: 'object',
    required: ['id', 'email', 'role'],
    properties: {
      id: { type: 'string' },
      email: { type: 'string', format: 'email' },
      role: { type: 'string', enum:['viewer' , 'editor']  }
    }
  },
  response: {
    200: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        success: { type: 'boolean' },
        data: { type: 'object', properties: {} }
      }
    }
  }
};

export const WSSheetSchema = {
  description: 'Upgrade Session to WebSocket Connection after owernship/permission check. For viewing/editing single sheets',
  tags: ['Sheets'],
  response: {
    400: {
      type: 'object',
      properties: {
        message: {type: 'string'},
        success: { type: 'boolean' },
        data: {type: 'array', items: {type: 'object'}}
      }
    }
  }
};
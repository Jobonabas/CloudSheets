import { SheetObject } from './sheetObject.ts';

export const GETSheetSchema = {
  description: 'List all sheets',
  tags: ['Sheets'],
  response: {
    200: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Sheets fetched successfully' },
        success: { type: 'boolean', example: true },
        userSheets: {
          type: 'array',
          items: SheetObject
        },
        sharedSheets: {
          type: 'array',
          items: SheetObject
        }
      },
      required: ['message', 'success', 'userSheets', 'sharedSheets']
    },
    // 403: {
    //   type: 'object',
    //   properties: {
    //     message: { type: 'string', example: 'Permission denied' },
    //     success: { type: 'boolean', example: false }
    //   },
    //   required: ['message', 'success']
    // },
    404: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Sheets not found' },
        success: { type: 'boolean', example: false }
      },
      required: ['message', 'success']
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
        message: { type: 'string', example: 'Sheet created successfully' },
        success: { type: 'boolean', example: true },
        //data: { type: 'object', properties: {} }
      },
      required: ['message', 'success']
    },
    400: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Invalid input' },
        success: { type: 'boolean', example: false }
      },
      required: ['message', 'success']
    },
    403: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Permission denied' },
        success: { type: 'boolean', example: false }
      },
      required: ['message', 'success']
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
        message: { type: 'string', example: 'Sheet deleted successfully' },
        success: { type: 'boolean', example: true },
        //data: { type: 'array', items: { type: 'object' } }
      },
      required: ['message', 'success']
    },
    403: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Permission denied' },
        success: { type: 'boolean', example: false }
      },
      required: ['message', 'success']
    },
    404: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Sheet not found' },
        success: { type: 'boolean', example: false }
      },
      required: ['message', 'success']
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
        message: { type: 'string', example: 'Success' },
        success: { type: 'boolean', example: true },
        //data: { type: 'object', properties: {} }
      },
      required: ['message', 'success']
    },
    403: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Permission denied'},
        success: { type: 'boolean', example: false },
      },
      required: ['message', 'success']
    },
    404: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Sheet not found'},
        success: { type: 'boolean', example: false},
      },
      required: ['message', 'success']
    }
  }
};

export const WSSheetSchema = {
  description: 'Upgrade Session to WebSocket Connection after owernship/permission check. For viewing/editing single sheets',
  tags: ['Sheets'],
  response: {
    101: {
      description: 'WebSocket protocol upgrade successful, lets edit some sheets together!'
    },
    400: {
      description: 'Bad request :c',
      type: 'object',
      properties: {
        message: {type: 'string', example: 'Invalid request :c'},
        success: { type: 'boolean', example: false},
        //data: {type: 'array', items: {type: 'object'}}
      },
      required: ['message', 'success']
    },
    403: {
      description: 'Forbidden (Permission denied)',
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Permission denied. Not geil enough?'},
        success: { type: 'boolean', example: false}
      },
      required: ['message', 'success']
    }
  }
};

export const HEALTHSchema = {
  description: 'Return "ok" if Endpoint/Backend is reachable',
  tags: ['Health'],
  response: {
    200: {
      type: 'object',
      properties: {
        message: {type: 'string'},
        example: { type: 'ok' }
      }
    }
  }
};

export const PINGSchema = {
  description: 'Return "pong" if Endpoint/Backend is reachable',
  tags: ['Health'],
  response: {
    200: {
      type: 'object',
      properties: {
        message: {type: 'string'},
        example: { type: 'pong' }
      }
    }
  }
};
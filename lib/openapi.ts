export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Fringue Enterprise API',
    description:
      'B2B virtual try-on API. Partner endpoints use `X-API-Key`. Admin endpoints use `X-Admin-Secret`.',
    version: '1.0.0',
    contact: { email: 'enterprise@fringue.app' },
  },
  servers: [{ url: '/api/v1', description: 'Current server' }],
  tags: [
    { name: 'Partner', description: 'Partner-facing endpoints (X-API-Key auth)' },
    { name: 'Admin — Customers', description: 'Customer management (X-Admin-Secret auth)' },
    { name: 'Admin — API Keys', description: 'API key management (X-Admin-Secret auth)' },
    { name: 'Admin — Credits', description: 'Credit management (X-Admin-Secret auth)' },
    { name: 'Admin — Usage', description: 'Usage history (X-Admin-Secret auth)' },
    { name: 'Admin — Maintenance', description: 'Maintenance operations (X-Admin-Secret auth)' },
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'Partner API key (format: `fre_live_...`)',
      },
      AdminSecret: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Admin-Secret',
        description: 'Admin secret for backoffice operations',
      },
    },
    schemas: {
      EnterpriseCustomer: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'Acme Corp' },
          slug: { type: 'string', example: 'acme-corp' },
          contactEmail: { type: 'string', format: 'email', example: 'admin@acme.com' },
          isActive: { type: 'boolean', example: true },
          creditBalance: { type: 'integer', example: 100 },
          creditsPerRequest: { type: 'integer', example: 2 },
          rpmLimit: { type: 'integer', example: 60 },
          allowedModels: { type: 'array', items: { type: 'string' }, example: ['gemini-2.5-flash-image'] },
          defaultModel: { type: 'string', example: 'gemini-2.5-flash-image' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      EnterpriseApiKey: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          customerId: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'Production Key' },
          keyPrefix: { type: 'string', example: 'fre_live_a3f' },
          isActive: { type: 'boolean', example: true },
          lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
          expiresAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      ProcessingJob: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: ['processing', 'completed', 'failed'] },
          itemName: { type: 'string', example: 'Blue Denim Jacket' },
          modelUsed: { type: 'string', example: 'gemini-2.5-flash-image' },
          creditsDeducted: { type: 'integer', nullable: true, example: 2 },
          metadata: {
            type: 'object',
            nullable: true,
            properties: {
              processingTimeMs: { type: 'integer', example: 4200 },
              inputTokens: { type: 'integer', example: 1024 },
              outputTokens: { type: 'integer', example: 512 },
              totalTokens: { type: 'integer', example: 1536 },
            },
          },
          processingStartedAt: { type: 'string', format: 'date-time' },
          processingCompletedAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      CreditTransaction: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          customerId: { type: 'string', format: 'uuid' },
          jobId: { type: 'string', format: 'uuid', nullable: true },
          amount: { type: 'integer', example: -2, description: 'Negative = deducted, positive = added' },
          actionType: { type: 'string', enum: ['api_request', 'admin_add', 'admin_deduct'] },
          description: { type: 'string', nullable: true },
          balanceAfter: { type: 'integer', example: 48 },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      PaginatedResponse: {
        type: 'object',
        properties: {
          total: { type: 'integer', example: 42 },
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 20 },
          totalPages: { type: 'integer', example: 3 },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Unauthorized' },
        },
      },
    },
    parameters: {
      CustomerId: {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
        description: 'Customer ID',
      },
      KeyId: {
        name: 'keyId',
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
        description: 'API Key ID',
      },
      Page: {
        name: 'page',
        in: 'query',
        schema: { type: 'integer', default: 1 },
      },
      Limit: {
        name: 'limit',
        in: 'query',
        schema: { type: 'integer', default: 20, maximum: 100 },
      },
    },
  },
  paths: {
    // ── Partner ─────────────────────────────────────────────────────────────
    '/try-on': {
      post: {
        tags: ['Partner'],
        summary: 'Virtual try-on (SSE)',
        description:
          'Perform a virtual try-on. Returns a **Server-Sent Events** stream with real-time progress. Save the `processing_id` from the first event — use `GET /result/{processingId}` if the connection drops.',
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['person_image', 'clothing_image', 'item_name'],
                properties: {
                  person_image: {
                    type: 'string',
                    description: 'Base64-encoded person photo (JPEG/PNG/WebP, max 3MB encoded)',
                    example: '<base64>',
                  },
                  clothing_image: {
                    type: 'string',
                    description: 'Base64-encoded clothing photo (JPEG/PNG/WebP, max 3MB encoded)',
                    example: '<base64>',
                  },
                  item_name: {
                    type: 'string',
                    description: 'Name of the clothing item',
                    example: 'Blue Denim Jacket',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'SSE stream (`text/event-stream`)',
            content: {
              'text/event-stream': {
                schema: {
                  type: 'string',
                  description: 'Sequence of SSE events. Each line: `data: <JSON>\\n\\n`',
                  example: [
                    'data: {"step":"processing","progress":10,"message":"Starting try-on...","processing_id":"uuid"}',
                    'data: {"step":"generating","progress":30,"message":"Generating virtual try-on..."}',
                    'data: {"step":"uploading","progress":80,"message":"Saving result..."}',
                    'data: {"step":"completed","progress":100,"processing_id":"uuid","result_url":"https://...","result_url_expires_at":"ISO","credits_used":2,"credits_remaining":48,"model_used":"gemini-2.5-flash-image","processing_time_ms":4200}',
                  ].join('\n'),
                },
              },
            },
          },
          '400': { description: 'Missing or invalid fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '401': { description: 'Invalid, revoked, or expired API key', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '403': { description: 'Insufficient credits', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '429': { description: 'RPM limit exceeded — includes `Retry-After` header', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/result/{processingId}': {
      get: {
        tags: ['Partner'],
        summary: 'Get try-on result',
        description: 'Retrieve status and result of a try-on job. Use as a fallback if your SSE connection dropped. Signed URL is automatically refreshed if expired.',
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          {
            name: 'processingId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'Processing ID from the try-on SSE stream',
          },
        ],
        responses: {
          '200': {
            description: 'Job details',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    processing_id: { type: 'string', format: 'uuid' },
                    status: { type: 'string', enum: ['processing', 'completed', 'failed'] },
                    result_url: { type: 'string', format: 'uri', nullable: true, description: '30-min signed URL (present when completed)' },
                    result_url_expires_at: { type: 'string', format: 'date-time', nullable: true },
                    error: { type: 'string', nullable: true },
                    credits_deducted: { type: 'integer', nullable: true },
                    model_used: { type: 'string' },
                    metadata: { type: 'object', nullable: true },
                    created_at: { type: 'string', format: 'date-time' },
                    processing_completed_at: { type: 'string', format: 'date-time', nullable: true },
                  },
                },
              },
            },
          },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Not found or belongs to another customer', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '410': { description: 'Job expired (older than 7 days)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    // ── Admin — Customers ────────────────────────────────────────────────────
    '/admin/customers': {
      get: {
        tags: ['Admin — Customers'],
        summary: 'List customers',
        security: [{ AdminSecret: [] }],
        parameters: [
          { $ref: '#/components/parameters/Page' },
          { $ref: '#/components/parameters/Limit' },
        ],
        responses: {
          '200': {
            description: 'Paginated customer list',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/PaginatedResponse' },
                    { type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/EnterpriseCustomer' } } } },
                  ],
                },
              },
            },
          },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      post: {
        tags: ['Admin — Customers'],
        summary: 'Create customer',
        security: [{ AdminSecret: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'slug', 'contactEmail'],
                properties: {
                  name: { type: 'string', example: 'Acme Corp' },
                  slug: { type: 'string', example: 'acme-corp' },
                  contactEmail: { type: 'string', format: 'email', example: 'admin@acme.com' },
                  creditBalance: { type: 'integer', example: 100 },
                  creditsPerRequest: { type: 'integer', example: 2 },
                  rpmLimit: { type: 'integer', example: 60 },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Customer created', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, customer: { $ref: '#/components/schemas/EnterpriseCustomer' } } } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/admin/customers/{id}': {
      get: {
        tags: ['Admin — Customers'],
        summary: 'Get customer',
        security: [{ AdminSecret: [] }],
        parameters: [{ $ref: '#/components/parameters/CustomerId' }],
        responses: {
          '200': { description: 'Customer details', content: { 'application/json': { schema: { type: 'object', properties: { customer: { $ref: '#/components/schemas/EnterpriseCustomer' } } } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      put: {
        tags: ['Admin — Customers'],
        summary: 'Update customer',
        security: [{ AdminSecret: [] }],
        parameters: [{ $ref: '#/components/parameters/CustomerId' }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  contactEmail: { type: 'string', format: 'email' },
                  isActive: { type: 'boolean' },
                  rpmLimit: { type: 'integer' },
                  creditsPerRequest: { type: 'integer' },
                  allowedModels: { type: 'array', items: { type: 'string' } },
                  defaultModel: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Customer updated', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, customer: { $ref: '#/components/schemas/EnterpriseCustomer' } } } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      delete: {
        tags: ['Admin — Customers'],
        summary: 'Delete customer',
        description: 'Deletes customer and cascades to API keys. Processing jobs and transactions are not cascade-deleted.',
        security: [{ AdminSecret: [] }],
        parameters: [{ $ref: '#/components/parameters/CustomerId' }],
        responses: {
          '200': { description: 'Customer deleted', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, deleted: { type: 'object', properties: { customer_id: { type: 'string', format: 'uuid' } } } } } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    // ── Admin — API Keys ────────────────────────────────────────────────────
    '/admin/customers/{id}/api-keys': {
      get: {
        tags: ['Admin — API Keys'],
        summary: 'List API keys',
        description: 'Returns key metadata only. The plaintext key is never stored and cannot be retrieved after creation.',
        security: [{ AdminSecret: [] }],
        parameters: [{ $ref: '#/components/parameters/CustomerId' }],
        responses: {
          '200': {
            description: 'API key list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: { type: 'array', items: { $ref: '#/components/schemas/EnterpriseApiKey' } },
                    total: { type: 'integer' },
                  },
                },
              },
            },
          },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      post: {
        tags: ['Admin — API Keys'],
        summary: 'Create API key',
        description: 'Generates a new API key. The full key (`fre_live_...`) is returned **once** in the response and never stored — save it immediately.',
        security: [{ AdminSecret: [] }],
        parameters: [{ $ref: '#/components/parameters/CustomerId' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', example: 'Production Key' },
                  expiresAt: { type: 'string', format: 'date-time', description: 'Optional expiry — omit for no expiry' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Key created — full key shown once',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    api_key: { type: 'string', description: 'Full plaintext key — save this now, it cannot be recovered', example: 'fre_live_a3f...' },
                    key: { $ref: '#/components/schemas/EnterpriseApiKey' },
                  },
                },
              },
            },
          },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/admin/customers/{id}/api-keys/{keyId}': {
      delete: {
        tags: ['Admin — API Keys'],
        summary: 'Revoke API key',
        description: 'Sets `isActive = false`. The key row is retained for audit purposes.',
        security: [{ AdminSecret: [] }],
        parameters: [
          { $ref: '#/components/parameters/CustomerId' },
          { $ref: '#/components/parameters/KeyId' },
        ],
        responses: {
          '200': { description: 'Key revoked', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, revoked: { type: 'object', properties: { key_id: { type: 'string', format: 'uuid' } } } } } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    // ── Admin — Credits ─────────────────────────────────────────────────────
    '/admin/customers/{id}/credits': {
      get: {
        tags: ['Admin — Credits'],
        summary: 'Get balance & transaction history',
        security: [{ AdminSecret: [] }],
        parameters: [
          { $ref: '#/components/parameters/CustomerId' },
          { $ref: '#/components/parameters/Page' },
          { $ref: '#/components/parameters/Limit' },
        ],
        responses: {
          '200': {
            description: 'Balance and paginated transactions',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/PaginatedResponse' },
                    {
                      type: 'object',
                      properties: {
                        balance: { type: 'integer', example: 48 },
                        transactions: { type: 'array', items: { $ref: '#/components/schemas/CreditTransaction' } },
                      },
                    },
                  ],
                },
              },
            },
          },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      post: {
        tags: ['Admin — Credits'],
        summary: 'Add or deduct credits',
        description: 'Pass a positive `amount` to add credits, negative to deduct.',
        security: [{ AdminSecret: [] }],
        parameters: [{ $ref: '#/components/parameters/CustomerId' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['amount'],
                properties: {
                  amount: { type: 'integer', example: 100, description: 'Positive = add, negative = deduct' },
                  description: { type: 'string', example: 'Monthly top-up' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Credits updated', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, balance: { type: 'integer', example: 148 }, transaction_id: { type: 'string', format: 'uuid' } } } } } },
          '400': { description: 'Invalid amount or insufficient balance for deduction', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    // ── Admin — Usage ────────────────────────────────────────────────────────
    '/admin/customers/{id}/usage': {
      get: {
        tags: ['Admin — Usage'],
        summary: 'Get job history',
        security: [{ AdminSecret: [] }],
        parameters: [
          { $ref: '#/components/parameters/CustomerId' },
          { $ref: '#/components/parameters/Page' },
          { $ref: '#/components/parameters/Limit' },
        ],
        responses: {
          '200': {
            description: 'Paginated job history',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/PaginatedResponse' },
                    { type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/ProcessingJob' } } } },
                  ],
                },
              },
            },
          },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    // ── Admin — Maintenance ──────────────────────────────────────────────────
    '/admin/cleanup': {
      post: {
        tags: ['Admin — Maintenance'],
        summary: 'Purge expired data',
        description: 'Deletes processing jobs older than 7 days (+ their R2 files) and RPM counter rows older than 1 hour. Run on a daily schedule.',
        security: [{ AdminSecret: [] }],
        responses: {
          '200': {
            description: 'Cleanup result',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    deleted_jobs: { type: 'integer', example: 12 },
                    deleted_rpm_rows: { type: 'integer', example: 340 },
                    r2_errors: { type: 'array', items: { type: 'string' }, description: 'Any R2 deletion errors (non-fatal)' },
                  },
                },
              },
            },
          },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
  },
};

# Fringue Enterprise API

Partner documentation for the Fringue virtual try-on B2B API.

**Base URL:** `https://business.fringue.app/api/v1`

---

## Authentication

All partner endpoints require an API key in the request header:

```
X-API-Key: fre_live_<your-key>
```

API keys are created and managed through the Fringue backoffice. Each key is tied to a customer account with a credit balance and RPM (requests per minute) limit. Keys are shown **once** on creation — store them securely.

---

## POST /try-on

Perform a virtual try-on. Returns a Server-Sent Events (SSE) stream with real-time progress.

### Request

```http
POST /api/v1/try-on
X-API-Key: fre_live_...
Content-Type: application/json

{
  "person_image": "<base64 JPEG/PNG/WebP>",
  "clothing_image": "<base64 JPEG/PNG/WebP>",
  "item_name": "Blue Denim Jacket"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `person_image` | string | Yes | Base64-encoded photo of the person. Max 3MB encoded. |
| `clothing_image` | string | Yes | Base64-encoded photo of the clothing item. Max 3MB encoded. |
| `item_name` | string | Yes | Name of the clothing item (used for logging). |

**Image requirements:**
- Format: JPEG, PNG, or WebP
- Max size: 3MB per image (base64 encoded)
- Recommended resolution: 1024×1024 or larger
- Person image should show the full body or upper body clearly

### Response — SSE Stream

The endpoint returns `Content-Type: text/event-stream`. Each event follows the SSE protocol:

```
data: <JSON>\n\n
```

**Event sequence:**

```
data: {"step":"processing","progress":10,"message":"Starting try-on...","processing_id":"uuid"}

data: {"step":"generating","progress":30,"message":"Generating virtual try-on..."}

data: {"step":"uploading","progress":80,"message":"Saving result..."}

data: {"step":"completed","progress":100,"processing_id":"uuid","result_url":"https://...","result_url_expires_at":"2026-03-02T13:00:00.000Z","credits_used":2,"credits_remaining":48,"model_used":"gemini-2.5-flash-image","processing_time_ms":4200}
```

**On error (after stream opens):**
```
data: {"step":"error","error":"message","processing_id":"uuid"}
```

> Save the `processing_id` from the `processing` event immediately. If your SSE connection drops before the `completed` event, use `GET /result/:id` to retrieve the result.

### Pre-stream Error Responses

These are returned as plain JSON before the SSE stream opens:

| Status | Condition |
|--------|-----------|
| 400 | Missing or invalid fields |
| 401 | Invalid, revoked, or expired API key |
| 403 | Insufficient credits |
| 429 | RPM limit exceeded — includes `Retry-After: N` header |

### Example — cURL

```bash
curl -X POST https://business.fringue.app/api/v1/try-on \
  -H "X-API-Key: fre_live_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "person_image": "'$(base64 -i person.jpg)'",
    "clothing_image": "'$(base64 -i jacket.jpg)'",
    "item_name": "Blue Denim Jacket"
  }'
```

### Example — Node.js (fetch streaming)

```javascript
const response = await fetch('https://business.fringue.app/api/v1/try-on', {
  method: 'POST',
  headers: {
    'X-API-Key': 'fre_live_your_key_here',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    person_image: personBase64,
    clothing_image: clothingBase64,
    item_name: 'Blue Denim Jacket',
  }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const text = decoder.decode(value);
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const event = JSON.parse(line.slice(6));
      console.log(event);

      if (event.step === 'completed') {
        console.log('Result URL:', event.result_url);
        console.log('Credits remaining:', event.credits_remaining);
      }

      if (event.step === 'error') {
        console.error('Error:', event.error);
      }
    }
  }
}
```

### Example — Browser EventSource (GET not supported; use fetch above)

EventSource only supports GET requests. Use the `fetch` streaming example above for POST endpoints.

---

## GET /result/:processingId

Retrieve the status and result of a try-on job. Use this as a fallback if your SSE connection dropped.

### Request

```http
GET /api/v1/result/{processingId}
X-API-Key: fre_live_...
```

### Response

```json
{
  "processing_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "result_url": "https://...",
  "result_url_expires_at": "2026-03-02T13:00:00.000Z",
  "credits_deducted": 2,
  "model_used": "gemini-2.5-flash-image",
  "metadata": {
    "processingTimeMs": 4200,
    "inputTokens": 1024,
    "outputTokens": 512,
    "totalTokens": 1536
  },
  "created_at": "2026-03-02T12:30:00.000Z",
  "processing_completed_at": "2026-03-02T12:30:04.200Z"
}
```

| Field | Description |
|-------|-------------|
| `status` | `processing` \| `completed` \| `failed` |
| `result_url` | Signed URL to the result image (present when `completed`) |
| `result_url_expires_at` | ISO timestamp of URL expiry (30 minutes) |
| `error` | Error message (present when `failed`) |

**Signed URLs** expire after 30 minutes but are automatically refreshed on each `GET /result/:id` call if expired. Jobs are retained for 7 days.

### Status Codes

| Status | Condition |
|--------|-----------|
| 200 | Success |
| 401 | Unauthorized |
| 404 | Job not found or belongs to another customer |
| 410 | Job has expired (older than 7 days) |

---

## Rate Limits

Each customer has a configurable RPM (requests per minute) limit. When exceeded:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 42

{"error": "Rate limit exceeded"}
```

Wait the number of seconds in the `Retry-After` header before retrying.

---

## Credit System

Each try-on request deducts credits from your customer account balance. The cost per request is configured by Fringue (default: 2 credits).

- **Insufficient credits:** The request is rejected with `403` before the SSE stream opens.
- **Credit deduction** happens atomically after the image is successfully generated and uploaded. Failed requests do not consume credits.
- The `completed` event includes `credits_used` and `credits_remaining`.

---

## Result Lifecycle

| Item | Retention |
|------|-----------|
| Job record | 7 days from creation |
| Result image (R2) | 7 days — deleted on cleanup |
| Signed URL | 30 minutes — auto-refreshed via `GET /result/:id` |

---

## Error Handling Best Practices

1. **Save `processing_id`** from the `processing` SSE event before waiting for `completed`.
2. **Poll on disconnect:** If the SSE stream drops, poll `GET /result/:id` every 5 seconds until `status` is `completed` or `failed`.
3. **Retry on 429:** Respect the `Retry-After` header.
4. **Retry on 503:** The AI service may occasionally be overloaded. Retry after 30-60 seconds.
5. **Check credits proactively:** Monitor `credits_remaining` in the `completed` event to avoid 403 errors.

---

## Available Models

| Model ID | Description |
|----------|-------------|
| `gemini-2.5-flash-image` | Gemini 2.5 Flash — image generation (default) |

The model used for each request is determined by your account's `defaultModel` setting, configured via the backoffice.

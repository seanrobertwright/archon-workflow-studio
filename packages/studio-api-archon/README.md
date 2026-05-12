# @archon-studio/api-archon

HTTP client for the Archon backend API. Implements the `WorkflowApiClient` interface from `@archon-studio/core`.

## Usage

```ts
import { ArchonApiClient } from '@archon-studio/api-archon';

const client = new ArchonApiClient({
  baseUrl: 'http://localhost:3737',
  authHeader: 'Bearer my-token', // optional
});

// Test connection
const { ok, serverVersion } = await client.ping();

// List workflows
const workflows = await client.listWorkflows('/home/user/my-project');
```

## Constructor options

```ts
interface ArchonApiClientOptions {
  baseUrl: string;
  authHeader?: string;
  fetchFn?: typeof fetch; // inject a mock fetch for testing
}
```

## Testing

Inject a mock `fetchFn` to unit-test without a live server:

```ts
import { ArchonApiClient } from '@archon-studio/api-archon';

const client = new ArchonApiClient({
  baseUrl: 'http://localhost:3737',
  fetchFn: async (url) => {
    // return mock responses
  },
});
```

## Error handling

```ts
import { ArchonHttpError } from '@archon-studio/api-archon';

try {
  await client.getWorkflow('missing', '/home/user');
} catch (err) {
  if (err instanceof ArchonHttpError) {
    console.log(err.status); // e.g. 404
    console.log(err.endpoint); // e.g. '/api/workflows/missing'
  }
}
```

## StubArchonApiClient

For development without a live Archon instance, use `StubArchonApiClient` — returns empty/no-op responses for all methods.

```ts
import { StubArchonApiClient } from '@archon-studio/api-archon';
const client = new StubArchonApiClient();
```

# @vitkuz/youtube-adapter

Functional YouTube Data API adapter for AWS/Node.js environments.

## Installation

```bash
npm install @vitkuz/youtube-adapter
```

## Usage

```typescript
import { createAdapter } from '@vitkuz/youtube-adapter';

const adapter = createAdapter({
  apiKey: process.env.YOUTUBE_API_KEY,
  logger: console, // Optional logger
});

// Search
const results = await adapter.search({
  q: 'Node.js tutorial',
  maxResults: 5
});

// Get Video Details
if (results.items?.length) {
    const videoId = results.items[0].id.videoId;
    const details = await adapter.videoDetails({
        id: [videoId]
    });
}
```

## Operations

- `search(input: SearchInput)`: Search for videos, channels, playlists.
- `videoDetails(input: VideoDetailsInput)`: Get detailed information about videos.

## Configuration

Required environment variables:
- `YOUTUBE_API_KEY` (if using env vars, otherwise pass to constructor)

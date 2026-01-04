import * as dotenv from 'dotenv';
import { createAdapter } from '../src/index';
import { join } from 'path';
import { writeFile } from 'fs/promises';

// Handle dotenv up/down directory walking
// Handle dotenv up/down directory walking
dotenv.config({ path: join(__dirname, '../.env') });
if (!process.env.YOUTUBE_API_KEY) {
    dotenv.config({ path: join(__dirname, '../../.env') });
}

const apiKey = process.env.YOUTUBE_API_KEY || 'test';
const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;

if (!firecrawlApiKey) {
    console.warn('FIRECRAWL_API_KEY is missing. Test might fail if it relies on firecrawl.');
}

const adapter = createAdapter({
    apiKey,
    firecrawlApiKey,
    logger: {
        debug: (msg: string, ctx?: any) => console.log(`[DEBUG] ${msg}`, ctx || ''),
        error: (msg: string, ctx?: any) => console.error(`[ERROR] ${msg}`, ctx || ''),
        info: (msg: string, ctx?: any) => console.log(`[INFO] ${msg}`, ctx || ''),
        warn: (msg: string, ctx?: any) => console.warn(`[WARN] ${msg}`, ctx || ''),
    },
});

async function main() {
    try {
        // Video ID: jNQXAC9IVRw (Me at the zoo) - usually has captions or auto-captions
        // Or using a newer one if that fails. Let's try to verify one that has them.
        // Google I/O 2011: Chrome Keynote: u1zgFlCw8yE
        const videoId = 'Mgg_tytybNk'; // Longer video
        console.log(`Testing getTranscript() for Video ID: ${videoId}...`);

        const result = await adapter.getTranscript({
            videoId,
        });

        console.log(`Successfully fetched transcript with ${result.length} segments.`);

        if (result.length > 0) {
            console.log('First segment:', result[0]);
        }

        const outputPath = join(__dirname, 'responses/get-transcript.result.json');
        await writeFile(outputPath, JSON.stringify(result, null, 2));
        console.log(`Saved result to ${outputPath}`);

        console.log('SUCCESS');
    } catch (error) {
        console.error('FAILED:', error);
        process.exit(1);
    }
}

main();

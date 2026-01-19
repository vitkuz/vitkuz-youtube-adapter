import * as dotenv from 'dotenv';
import { createAdapter } from '../src/index';
import { join } from 'path';
import { writeFile, mkdir } from 'fs/promises';

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
    logger: {
        debug: (msg: string, ctx?: any) =>
            console.log(`[DEBUG] ${msg} ${ctx ? JSON.stringify(ctx).slice(0, 500) : ''}`),
        error: (msg: string, ctx?: any) => console.error(`[ERROR] ${msg}`, ctx || ''),
        info: (msg: string, ctx?: any) => console.log(`[INFO] ${msg}`, ctx || ''),
        warn: (msg: string, ctx?: any) => console.warn(`[WARN] ${msg}`, ctx || ''),
    },
});

async function main() {
    const responsesDir = join(__dirname, 'responses');
    await mkdir(responsesDir, { recursive: true });

    try {
        const videoId = 'xRALfsRKy84';
        console.log(`Testing getTranscriptHtml() for Video ID: ${videoId}...`);

        const result = await adapter.getTranscriptHtml({
            videoId,
        });

        console.log(`Successfully fetched transcript HTML. Length: ${result.html.length} chars.`);
        console.log(`Found ${result.segments.length} transcript segments.`);

        if (result.segments.length > 0) {
            console.log('First segment:', result.segments[0]);
            console.log('Last segment:', result.segments[result.segments.length - 1]);
        } else {
            throw new Error('No transcript segments found!');
        }

        const outputPath = join(responsesDir, 'transcript.html');
        await writeFile(outputPath, result.html);
        console.log(`Saved HTML to ${outputPath}`);

        const jsonPath = join(responsesDir, 'transcript-segments.json');
        await writeFile(jsonPath, JSON.stringify(result.segments, null, 2));
        console.log(`Saved segments to ${jsonPath}`);

        console.log('SUCCESS');
    } catch (error: any) {
        console.error('FAILED:', error.message);
        process.exit(1);
    }
}

main();

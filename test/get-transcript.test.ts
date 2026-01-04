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

const logs: any[] = [];
const logger = {
    debug: (msg: string, ctx?: any) => {
        const logEntry = { level: 'DEBUG', msg, ctx };
        console.log(`[DEBUG] ${msg}`, ctx ? JSON.stringify(ctx).slice(0, 200) : '');
        logs.push(logEntry);
    },
    error: (msg: string, ctx?: any) => {
        const logEntry = { level: 'ERROR', msg, ctx };
        console.error(`[ERROR] ${msg}`, ctx ? JSON.stringify(ctx) : '');
        logs.push(logEntry);
    },
    info: (msg: string, ctx?: any) => {
        const logEntry = { level: 'INFO', msg, ctx };
        console.log(`[INFO] ${msg}`, ctx ? JSON.stringify(ctx) : '');
        logs.push(logEntry);
    },
    warn: (msg: string, ctx?: any) => {
        const logEntry = { level: 'WARN', msg, ctx };
        console.warn(`[WARN] ${msg}`, ctx ? JSON.stringify(ctx) : '');
        logs.push(logEntry);
    },
};

const adapter = createAdapter({
    apiKey,
    firecrawlApiKey,
    logger,
});

async function main() {
    const responsesDir = join(__dirname, 'responses');
    await mkdir(responsesDir, { recursive: true });

    try {
        const videoId = 'Mgg_tytybNk';
        console.log(`Testing getTranscript() for Video ID: ${videoId}...`);

        const result = await adapter.getTranscript({
            videoId,
        });

        console.log(`Successfully fetched transcript with ${result.length} segments.`);

        if (result.length > 0) {
            console.log('First segment:', result[0]);
        }

        const outputPath = join(responsesDir, 'get-transcript.result.json');
        await writeFile(outputPath, JSON.stringify(result, null, 2));
        console.log(`Saved result to ${outputPath}`);

        console.log('SUCCESS');
    } catch (error: any) {
        console.error('FAILED:', error.message);

        const errorPath = join(responsesDir, 'get-transcript.error.json');
        await writeFile(errorPath, JSON.stringify({ error: error.message, logs }, null, 2));
        console.log(`Saved error logs to ${errorPath}`);

        process.exit(1);
    }
}

main();

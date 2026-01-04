import * as dotenv from 'dotenv';
import { createAdapter } from '../src/index';
import { join } from 'path';
import { writeFile } from 'fs/promises';

dotenv.config({ path: join(__dirname, '../.env') });
if (!process.env.YOUTUBE_API_KEY) {
    dotenv.config({ path: join(__dirname, '../../.env') });
}

const apiKey = process.env.YOUTUBE_API_KEY;

if (!apiKey) {
    console.error('YOUTUBE_API_KEY environment variable is required');
    process.exit(1);
}

const adapter = createAdapter({
    apiKey,
    logger: {
        debug: (msg: string, ctx?: any) => console.log(`[DEBUG] ${msg}`, ctx || ''),
        error: (msg: string, ctx?: any) => console.error(`[ERROR] ${msg}`, ctx || ''),
        info: (msg: string, ctx?: any) => console.log(`[INFO] ${msg}`, ctx || ''),
        warn: (msg: string, ctx?: any) => console.warn(`[WARN] ${msg}`, ctx || ''),
    },
});

async function main() {
    try {
        // First search to get an ID
        console.log('Searching for a video to get details...');
        const searchResult = await adapter.search({
            q: 'TypeScript',
            maxResults: 1,
            type: ['video'],
        });

        const videoId = searchResult.items?.[0]?.id?.videoId;

        if (!videoId) {
            console.error('Could not find a video to test details with');
            return;
        }

        console.log(`Testing videoDetails() for ID: ${videoId}...`);
        const details = await adapter.videoDetails({
            id: [videoId],
        });

        console.log(`Retrieved details for ${details.items?.length || 0} videos`);

        const outputPath = join(__dirname, 'responses/video-details.result.json');
        await writeFile(outputPath, JSON.stringify(details, null, 2));
        console.log(`Saved result to ${outputPath}`);

        console.log('SUCCESS');
    } catch (error) {
        console.error('FAILED:', error);
        process.exit(1);
    }
}

main();

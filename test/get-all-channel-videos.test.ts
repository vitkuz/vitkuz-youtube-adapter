import * as dotenv from 'dotenv';
import { createAdapter } from '../src/index'; // Assumes types are exported from here, or I'll fix imports
import { join } from 'path';
import { writeFile } from 'fs/promises';

// Handle dotenv up/down directory walking
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
        const channelId = 'UCsBjURrPoezykLs9EqgamOA';
        console.log(`Testing getAllChannelVideos() for Channel ID: ${channelId}...`);

        const result = await adapter.getAllChannelVideos({
            channelId,
        });

        console.log(`Successfully fetched ${result.totalCount} videos.`);

        const outputPath = join(__dirname, 'responses/get-all-channel-videos.result.json');
        await writeFile(outputPath, JSON.stringify(result, null, 2));
        console.log(`Saved result to ${outputPath}`);

        console.log('SUCCESS');
    } catch (error) {
        console.error('FAILED:', error);
        process.exit(1);
    }
}

main();

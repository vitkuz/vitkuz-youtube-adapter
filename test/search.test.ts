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
        console.log('Testing search()...');
        const result = await adapter.search({
            q: 'Google Developers',
            maxResults: 5,
            type: ['video'],
        });

        console.log(`Found ${result.items?.length || 0} items`);

        const outputPath = join(__dirname, 'responses/search.result.json');
        await writeFile(outputPath, JSON.stringify(result, null, 2));
        console.log(`Saved result to ${outputPath}`);

        console.log('SUCCESS');
    } catch (error) {
        console.error('FAILED:', error);
        process.exit(1);
    }
}

main();

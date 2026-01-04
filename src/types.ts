import { YoutubeClient } from './client';
import { Adapter as FirecrawlAdapter } from '@vitkuz/firecrawl-adapter';

export interface Logger {
    debug: (message: string, context?: { error?: any; data?: any }) => void;
    [key: string]: any;
}

export interface Context {
    client: YoutubeClient;
    firecrawlAdapter?: FirecrawlAdapter;
    logger?: Logger;
}

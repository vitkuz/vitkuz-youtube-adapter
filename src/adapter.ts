import { createClient, YoutubeClient } from './client';
import { Context, Logger } from './types';
import { search, SearchInput, SearchOutput } from './operations/search';
import { videoDetails, VideoDetailsInput, VideoDetailsOutput } from './operations/video-details';
import {
    getAllChannelVideos,
    GetAllChannelVideosInput,
    GetAllChannelVideosOutput,
} from './operations/get-all-channel-videos';
import {
    getTranscript,
    GetTranscriptInput,
    GetTranscriptOutput,
} from './operations/get-transcript';
import {
    getTranscriptHtml,
    GetTranscriptHtmlInput,
    GetTranscriptHtmlOutput,
} from './operations/get-transcript-html';
import {
    channelDetails,
    ChannelDetailsInput,
    ChannelDetailsOutput,
} from './operations/channel-details';

export interface AdapterConfig {
    apiKey: string;
    firecrawlApiKey?: string;
    logger?: Logger;
}

export interface Adapter {
    client: YoutubeClient;
    search: (input: SearchInput) => Promise<SearchOutput>;
    videoDetails: (input: VideoDetailsInput) => Promise<VideoDetailsOutput>;
    channelDetails: (input: ChannelDetailsInput) => Promise<ChannelDetailsOutput>;
    getAllChannelVideos: (input: GetAllChannelVideosInput) => Promise<GetAllChannelVideosOutput>;
    getTranscript: (input: GetTranscriptInput) => Promise<GetTranscriptOutput>;
    getTranscriptHtml: (input: GetTranscriptHtmlInput) => Promise<GetTranscriptHtmlOutput>;
}

import { createAdapter as createFirecrawlAdapter, FirecrawlPlan } from '@vitkuz/firecrawl-adapter';

export const createAdapter = (config: AdapterConfig): Adapter => {
    const client = createClient(config.apiKey);

    let firecrawlAdapter;
    if (config.firecrawlApiKey) {
        firecrawlAdapter = createFirecrawlAdapter({
            apiKey: config.firecrawlApiKey,
            plan: FirecrawlPlan.FREE, // Default to free, could be configurable
            logger: config.logger,
        });
    }

    const context: Context = {
        client,
        firecrawlAdapter,
        logger: config.logger,
    };

    return {
        client,
        search: search(context),
        videoDetails: videoDetails(context),
        channelDetails: channelDetails(context),
        getAllChannelVideos: getAllChannelVideos(context),
        getTranscript: getTranscript(context),
        getTranscriptHtml: getTranscriptHtml(context),
    };
};

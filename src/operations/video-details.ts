import { Context } from '../types';
import { youtube_v3 } from 'googleapis';

export type VideoDetailsInput = youtube_v3.Params$Resource$Videos$List;
export type VideoDetailsOutput = youtube_v3.Schema$VideoListResponse;

export const videoDetails =
    (context: Context) =>
    async (input: VideoDetailsInput): Promise<VideoDetailsOutput> => {
        const { client, logger } = context;

        logger?.debug('videoDetails:start', { data: input });

        try {
            const response = await client.videos.list({
                part: ['snippet', 'contentDetails', 'statistics'],
                ...input,
            });

            logger?.debug('videoDetails:success');
            return response.data;
        } catch (error) {
            logger?.debug('videoDetails:error', { error });
            throw error;
        }
    };

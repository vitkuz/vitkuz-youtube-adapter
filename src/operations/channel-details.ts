import { Context } from '../types';
import { youtube_v3 } from 'googleapis';

export type ChannelDetailsInput = youtube_v3.Params$Resource$Channels$List;
export type ChannelDetailsOutput = youtube_v3.Schema$ChannelListResponse;

export const channelDetails =
    (context: Context) =>
        async (input: ChannelDetailsInput): Promise<ChannelDetailsOutput> => {
            const { client, logger } = context;

            logger?.debug('channelDetails:start', { data: input });

            try {
                const response = await client.channels.list({
                    part: ['snippet', 'contentDetails', 'statistics', 'brandingSettings'],
                    ...input,
                });

                logger?.debug('channelDetails:success');
                return response.data;
            } catch (error) {
                logger?.debug('channelDetails:error', { error });
                throw error;
            }
        };

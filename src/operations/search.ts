import { Context } from '../types';
import { youtube_v3 } from 'googleapis';

export type SearchInput = youtube_v3.Params$Resource$Search$List;
export type SearchOutput = youtube_v3.Schema$SearchListResponse;

export const search =
    (context: Context) =>
    async (input: SearchInput): Promise<SearchOutput> => {
        const { client, logger } = context;

        logger?.debug('search:start', { data: input });

        try {
            const response = await client.search.list({
                part: ['snippet'],
                ...input,
            });

            logger?.debug('search:success');
            return response.data;
        } catch (error) {
            logger?.debug('search:error', { error });
            throw error;
        }
    };

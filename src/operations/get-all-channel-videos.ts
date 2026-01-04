import { Context } from '../types';
import { youtube_v3 } from 'googleapis';

export interface GetAllChannelVideosInput {
    channelId: string;
}

export interface GetAllChannelVideosOutput {
    items: youtube_v3.Schema$Video[];
    totalCount: number;
}

export const getAllChannelVideos =
    (context: Context) =>
    async (input: GetAllChannelVideosInput): Promise<GetAllChannelVideosOutput> => {
        const { client, logger } = context;

        logger?.debug('getAllChannelVideos:start', { data: input });

        try {
            // Step 1: Get the Uploads playlist ID
            const channelResponse = await client.channels.list({
                id: [input.channelId],
                part: ['contentDetails'],
            });

            const uploadsPlaylistId =
                channelResponse.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

            if (!uploadsPlaylistId) {
                throw new Error(
                    `Could not find uploads playlist for channel ID: ${input.channelId}`,
                );
            }

            logger?.debug('getAllChannelVideos:found_playlist', { data: { uploadsPlaylistId } });

            // Step 2: Recursively fetch all playlist items and their video details
            let items: youtube_v3.Schema$Video[] = [];
            let nextPageToken: string | undefined = undefined;

            do {
                // Get playlist items (Video IDs)
                const playlistResponse: { data: youtube_v3.Schema$PlaylistItemListResponse } =
                    (await client.playlistItems.list({
                        playlistId: uploadsPlaylistId,
                        part: ['contentDetails'],
                        maxResults: 50,
                        pageToken: nextPageToken,
                    })) as any;

                const playlistItems = playlistResponse.data.items || [];

                if (playlistItems.length > 0) {
                    const videoIds = playlistItems
                        .map((item) => item.contentDetails?.videoId)
                        .filter((id): id is string => !!id);

                    if (videoIds.length > 0) {
                        // Fetch full video details
                        const videosResponse = await client.videos.list({
                            id: videoIds,
                            part: ['snippet', 'contentDetails', 'statistics'],
                        });

                        const videoItems = videosResponse.data.items || [];
                        items = items.concat(videoItems);
                    }
                }

                nextPageToken = playlistResponse.data.nextPageToken || undefined;

                logger?.debug('getAllChannelVideos:fetched_page', {
                    data: {
                        fetched: playlistItems.length,
                        totalVideosSoFar: items.length,
                        hasNextPage: !!nextPageToken,
                    },
                });
            } while (nextPageToken);

            logger?.debug('getAllChannelVideos:success', { data: { totalCount: items.length } });

            return {
                items,
                totalCount: items.length,
            };
        } catch (error) {
            logger?.debug('getAllChannelVideos:error', { error });
            throw error;
        }
    };

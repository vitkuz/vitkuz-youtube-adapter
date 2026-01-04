import { google, youtube_v3 } from 'googleapis';

export type YoutubeClient = youtube_v3.Youtube;

export const createClient = (apiKey: string): YoutubeClient => {
    return google.youtube({
        version: 'v3',
        auth: apiKey,
    });
};

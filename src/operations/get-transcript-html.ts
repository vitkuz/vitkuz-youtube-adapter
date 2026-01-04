import { Context } from '../types';
import { TranscriptItem } from './get-transcript';

export interface GetTranscriptHtmlInput {
    videoId: string;
    lang?: string;
}

export interface GetTranscriptHtmlOutput {
    html: string;
    segments: TranscriptItem[];
}

export const getTranscriptHtml =
    (context: Context) =>
        async (input: GetTranscriptHtmlInput): Promise<GetTranscriptHtmlOutput> => {
            const { logger, firecrawlAdapter } = context;
            logger?.debug('getTranscriptHtml:start', { data: input });

            if (!firecrawlAdapter) {
                throw new Error(
                    'Firecrawl adapter is not initialized. Provide firecrawlApiKey in config.',
                );
            }

            const url = `https://www.youtube.com/watch?v=${input.videoId}`;
            let html: string;

            try {
                const response = await firecrawlAdapter.scrape({
                    url,
                    params: {
                        formats: ['html'],
                        waitFor: 5000,
                    },
                });

                if (!response.success || !response.data || !response.data.html) {
                    throw new Error(
                        `Failed to scrape YouTube page HTML: ${response.error || 'No data returned'}`,
                    );
                }
                html = response.data.html;
            } catch (error: any) {
                logger?.debug('getTranscriptHtml:error', { error });
                throw new Error(`Failed to scrape YouTube page HTML: ${error.message || String(error)}`);
            }

            const segments: TranscriptItem[] = [];

            // Regex to find all transcript segment blocks
            const segmentRegex = /<ytd-transcript-segment-renderer[\s\S]*?<\/ytd-transcript-segment-renderer>/g;
            const matches = html.match(segmentRegex);

            const uniqueSegments = new Set<string>();

            if (matches) {
                logger?.debug('getTranscriptHtml:found-segments', { data: { count: matches.length } });

                for (const segmentHtml of matches) {
                    // Extract timestamp
                    // <div class="segment-timestamp style-scope ytd-transcript-segment-renderer"> 0:00 </div>
                    const timestampMatch = segmentHtml.match(/<div[^>]*class="[^"]*segment-timestamp[^"]*"[^>]*>\s*([\d:]+)\s*<\/div>/);

                    // Extract text
                    // <yt-formatted-string class="segment-text ..."> ... </yt-formatted-string>
                    const textMatch = segmentHtml.match(/<yt-formatted-string[^>]*class="[^"]*segment-text[^"]*"[^>]*>([\s\S]*?)<\/yt-formatted-string>/);

                    if (timestampMatch && textMatch) {
                        let text = textMatch[1].trim();
                        // Basic entity decoding
                        text = text.replace(/&amp;/g, '&')
                            .replace(/&lt;/g, '<')
                            .replace(/&gt;/g, '>')
                            .replace(/&quot;/g, '"')
                            .replace(/&#39;/g, "'");

                        const timestamp = timestampMatch[1].trim();
                        const key = `${timestamp}|${text}`;

                        if (!uniqueSegments.has(key)) {
                            uniqueSegments.add(key);
                            segments.push({
                                timestamp,
                                text,
                            });
                        }
                    }
                }
            } else {
                logger?.warn('getTranscriptHtml:no-segments-found', {
                    data: { msg: 'Regex found no ytd-transcript-segment-renderer blocks' }
                });
            }

            return {
                html,
                segments,
            };
        };

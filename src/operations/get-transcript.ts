import { Context } from '../types';

export interface GetTranscriptInput {
    videoId: string;
    lang?: string;
}

export interface TranscriptItem {
    timestamp: string;
    text: string;
}

export type GetTranscriptOutput = TranscriptItem[];

export const getTranscript =
    (context: Context) =>
    async (input: GetTranscriptInput): Promise<GetTranscriptOutput> => {
        const { logger, firecrawlAdapter } = context;
        logger?.debug('getTranscript:start', { data: input });

        if (!firecrawlAdapter) {
            throw new Error(
                'Firecrawl adapter is not initialized. Provide firecrawlApiKey in config.',
            );
        }

        const url = `https://www.youtube.com/watch?v=${input.videoId}`;
        let markdown: string;

        try {
            // Use firecrawlAdapter.scrape directly
            const response = await firecrawlAdapter.scrape({
                url,
                params: {
                    formats: ['markdown'],
                },
            });

            if (!response.success || !response.data || !response.data.markdown) {
                throw new Error(
                    `Failed to scrape YouTube page: ${response.error || 'No data returned'}`,
                );
            }
            markdown = response.data.markdown;
        } catch (error: any) {
            logger?.debug('getTranscript:error', { error });
            throw new Error(`Failed to scrape YouTube page: ${error.message || String(error)}`);
        }

        // Parsing logic reused from firecrawl adapter implementation
        const segments: TranscriptItem[] = [];

        const transcriptStartValues = markdown.split('## Transcript');
        if (transcriptStartValues.length < 2) {
            if (markdown.length < 500) {
                logger?.debug('getTranscript:markdown-too-short', { data: { markdown } });
            } else {
                logger?.debug('getTranscript:no-transcript-found', {
                    data: { preview: markdown.slice(0, 1000) },
                });
            }
            throw new Error('Transcript section not found in scraped content');
        }

        const transcriptContent = transcriptStartValues[1];

        const lines = transcriptContent.split('\n');
        let currentTimestamp = '';
        let currentText: string[] = [];

        const timestampRegex = /^(\d{1,2}:)?\d{1,2}:\d{2}$/; // Matches 0:01, 10:05, 1:00:00

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // Check if it's a timestamp
            if (timestampRegex.test(trimmed)) {
                // If we have a previous segment accumulating, push it
                if (currentTimestamp) {
                    segments.push({
                        timestamp: currentTimestamp,
                        text: currentText.join(' ').trim(),
                    });
                    currentText = [];
                }
                currentTimestamp = trimmed;
            } else {
                // It's text or a header?
                if (trimmed.startsWith('##')) continue;

                // Stop if we hit video thumbnails (footer)
                if (trimmed.startsWith('[![](')) {
                    break;
                }

                // Stop if we hit language options (English/German) which usually signify end of transcript
                if (trimmed === 'English' || trimmed === 'German') {
                    continue;
                }

                if (currentTimestamp) {
                    currentText.push(trimmed);
                }
            }
        }

        // Push last segment
        if (currentTimestamp && currentText.length > 0) {
            segments.push({
                timestamp: currentTimestamp,
                text: currentText.join(' ').trim(),
            });
        }

        logger?.debug('getTranscript:success', { data: { count: segments.length } });
        return segments;
    };

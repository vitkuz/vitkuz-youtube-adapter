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
                        // Attempt to bypass blocks
                        waitFor: 5000,
                        // Try to request stealth proxy if supported by the plan/SDK
                        // Note: 'proxy' param availability depends on Firecrawl version/plan
                    },
                });

                if (!response.success || !response.data || !response.data.markdown) {
                    // If 403 or other error, it might be in response.error or just failure
                    throw new Error(
                        `Failed to scrape YouTube page: ${response.error || 'No data returned'}`,
                    );
                }
                markdown = response.data.markdown;
            } catch (error: any) {
                logger?.debug('getTranscript:error', { error });
                throw new Error(`Failed to scrape YouTube page: ${error.message || String(error)}`);
            }

            // Parsing logic
            let transcriptContent = '';

            const transcriptStartValues = markdown.split('## Transcript');
            if (transcriptStartValues.length >= 2) {
                transcriptContent = transcriptStartValues[1];
            } else {
                // Fallback: looked for "Show transcript" button text which often precedes the transcript
                const showTranscriptSplit = markdown.split('Show transcript');
                if (showTranscriptSplit.length >= 2) {
                    // Usually the transcript is after the last "Show transcript" occurrence
                    transcriptContent = showTranscriptSplit[showTranscriptSplit.length - 1];
                    logger?.debug('getTranscript:using-fallback-header', {
                        data: { header: 'Show transcript' },
                    });
                } else {
                    // Last resort: try to parse the whole markdown, but this might pick up garbage
                    logger?.warn('getTranscript:no-transcript-header-found', {
                        data: { msg: 'Attempting to parse full markdown' },
                    });
                    transcriptContent = markdown;
                }
            }

            const segments: TranscriptItem[] = [];
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
                        // Only break if we already found some transcript segments, 
                        // to avoid breaking on channel icon at the top if we parsed full markdown
                        if (segments.length > 0) {
                            break;
                        }
                    }

                    // Stop if we hit language options (English/German) which usually signify end of transcript
                    // Or "Auto-dubbed" etc.
                    if (trimmed === 'English' || trimmed === 'German' || trimmed === 'Auto-dubbed') {
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

            if (segments.length === 0) {
                throw new Error('Transcript parsing failed: No segments found after parsing.');
            }

            logger?.debug('getTranscript:success', { data: { count: segments.length } });
            return segments;
        };

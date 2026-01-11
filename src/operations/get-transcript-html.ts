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

// =============================================================================
// InnerTube API Configuration
// =============================================================================

const INNERTUBE = {
    // Public API key embedded in YouTube's JavaScript - may change over time
    DEFAULT_API_KEY: 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
    API_URL: 'https://www.youtube.com/youtubei/v1/player',
    CLIENT_VERSION: '2.20250222.10.00',
};

// Current API key (can be refreshed if default stops working)
let currentApiKey: string = INNERTUBE.DEFAULT_API_KEY;

/**
 * Fetch fresh API key from YouTube's homepage
 */
const fetchFreshApiKey = async (logger?: any): Promise<string> => {
    logger?.debug('Fetching fresh API key from YouTube...');

    const response = await fetch('https://www.youtube.com', {
        headers: {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch YouTube homepage: ${response.status}`);
    }

    const html = await response.text();

    // Try multiple patterns to find the API key
    const patterns = [
        /"INNERTUBE_API_KEY":"([^"]+)"/,
        /innertubeApiKey":"([^"]+)"/,
        /api_key=([A-Za-z0-9_-]+)/,
    ];

    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
            logger?.debug(`Found new API key: ${match[1].slice(0, 10)}...`);
            return match[1];
        }
    }

    throw new Error('Could not find API key in YouTube page');
};

// =============================================================================
// Helper Functions
// =============================================================================

const generateVisitorData = (): string => {
    const chars =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    return Array.from({ length: 11 }, () =>
        chars.charAt(Math.floor(Math.random() * chars.length)),
    ).join('');
};

const decodeHtmlEntities = (text: string): string => {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(
            /&#(\d+);/g,
            (_, num) => String.fromCharCode(parseInt(num, 10)),
        )
        .replace(
            /&#x([a-fA-F0-9]+);/g,
            (_, hex) => String.fromCharCode(parseInt(hex, 16)),
        );
};

// =============================================================================
// Types
// =============================================================================

interface SubtitleEntry {
    start: number;
    duration: number;
    text: string;
}

interface CaptionTrack {
    baseUrl: string;
    vssId: string;
    languageCode: string;
    name: { simpleText: string };
}

interface PlayerResponse {
    playabilityStatus?: { status: string };
    captions?: {
        playerCaptionsTracklistRenderer?: {
            captionTracks?: CaptionTrack[];
        };
    };
}

// =============================================================================
// Core Extraction Logic
// =============================================================================

const getPlayerResponse = async (
    videoId: string,
    apiKey: string,
): Promise<PlayerResponse> => {
    const visitorData = generateVisitorData();

    const response = await fetch(`${INNERTUBE.API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'X-Youtube-Client-Version': INNERTUBE.CLIENT_VERSION,
            'X-Youtube-Client-Name': '1',
            'X-Goog-Visitor-Id': visitorData,
            Origin: 'https://www.youtube.com',
            Referer: 'https://www.youtube.com/',
        },
        body: JSON.stringify({
            context: {
                client: {
                    hl: 'en',
                    gl: 'US',
                    clientName: 'WEB',
                    clientVersion: INNERTUBE.CLIENT_VERSION,
                    visitorData,
                },
            },
            videoId,
            racyCheckOk: true,
            contentCheckOk: true,
        }),
    });

    if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
    }

    return response.json();
};

const fetchCaptionXml = async (
    baseUrl: string,
    videoId: string,
): Promise<string> => {
    const url = baseUrl.replace('&fmt=srv3', '');

    const response = await fetch(url, {
        headers: {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Referer: `https://www.youtube.com/watch?v=${videoId}`,
        },
    });

    if (!response.ok) {
        throw new Error(`Caption fetch failed: ${response.status}`);
    }

    return response.text();
};

const parseXmlCaptions = (xml: string): SubtitleEntry[] => {
    if (!xml.includes('<text')) return [];

    return xml
        .split('</text>')
        .filter((line) => line.includes('<text'))
        .map((line) => {
            const startMatch = /start="([\d.]+)"/.exec(line);
            const durMatch = /dur="([\d.]+)"/.exec(line);
            const textMatch = /<text[^>]*>(.+)$/s.exec(line);

            if (!startMatch || !durMatch || !textMatch) return null;

            const rawText = textMatch[1].replace(/<[^>]*>/g, '').trim();
            const text = decodeHtmlEntities(rawText);

            return {
                start: parseFloat(startMatch[1]),
                duration: parseFloat(durMatch[1]),
                text,
            };
        })
        .filter((e): e is SubtitleEntry => e !== null && e.text.length > 0);
};

// Formatter for timestamp
const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    // const ms = Math.floor((seconds % 1) * 1000);
    // Returning format like 0:01, 10:05, 1:00:00 to match previous format if possible or standard HH:MM:SS
    if (h > 0) {
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
};

/**
 * Core extraction logic (single attempt)
 */
const tryExtractSubtitles = async (
    videoId: string,
    apiKey: string,
    logger?: any,
): Promise<TranscriptItem[]> => {
    const playerData = await getPlayerResponse(videoId, apiKey);

    if (playerData.playabilityStatus?.status !== 'OK') {
        throw new Error(
            `Video not playable: ${playerData.playabilityStatus?.status}`,
        );
    }

    const tracks =
        playerData.captions?.playerCaptionsTracklistRenderer?.captionTracks ||
        [];

    if (tracks.length === 0) {
        throw new Error('No subtitles available for this video');
    }

    // Default to first track (usually English or auto-generated English)
    // Could enhance to filter by lang if input.lang is provided
    const track = tracks[0];
    logger?.debug(
        `Found caption track: ${track.name?.simpleText} (${track.languageCode})`,
    );

    const xml = await fetchCaptionXml(track.baseUrl, videoId);
    const subtitles = parseXmlCaptions(xml);

    if (subtitles.length === 0) {
        throw new Error('Failed to parse subtitles');
    }

    return subtitles.map((s) => ({
        timestamp: formatTime(s.start),
        text: s.text,
    }));
};

export const getTranscriptHtml =
    (context: Context) =>
        async (
            input: GetTranscriptHtmlInput,
        ): Promise<GetTranscriptHtmlOutput> => {
            const { logger } = context;
            logger?.debug('getTranscriptHtml:start', { data: input });

            const videoId = input.videoId;
            const MAX_ATTEMPTS = 3;
            let lastError: Error | null = null;
            let segments: TranscriptItem[] = [];

            for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                try {
                    logger?.debug(
                        `Attempt ${attempt}/${MAX_ATTEMPTS} (API key: ${currentApiKey.slice(0, 10)}...)`,
                    );

                    segments = await tryExtractSubtitles(
                        videoId,
                        currentApiKey,
                        logger,
                    );
                    break; // Success
                } catch (error: any) {
                    lastError =
                        error instanceof Error ? error : new Error(String(error));
                    logger?.warn(`Attempt ${attempt} failed: ${lastError.message}`);

                    // If not last attempt, try to get fresh API key
                    if (attempt < MAX_ATTEMPTS) {
                        try {
                            currentApiKey = await fetchFreshApiKey(logger);
                            logger?.debug('Retrying with new API key...');
                        } catch (keyError) {
                            logger?.warn(
                                `Failed to fetch new API key: ${keyError}`,
                            );
                        }
                    }
                }
            }

            if (segments.length === 0) {
                throw new Error(
                    `Failed after ${MAX_ATTEMPTS} attempts. Last error: ${lastError?.message}`,
                );
            }

            // Generate a simple HTML representation for debugging/completeness
            const htmlParts = segments.map(
                (s) =>
                    `<div class="segment"><span class="timestamp">${s.timestamp}</span><span class="text">${s.text}</span></div>`,
            );
            const html = `<html><body><div class="transcript">${htmlParts.join('\n')}</div></body></html>`;

            logger?.debug('getTranscriptHtml:success', {
                data: { count: segments.length },
            });

            return {
                html,
                segments,
            };
        };

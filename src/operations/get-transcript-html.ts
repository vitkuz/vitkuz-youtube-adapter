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
    // Public API key embedded in YouTube's JavaScript
    DEFAULT_API_KEY: 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
    API_URL: 'https://www.youtube.com/youtubei/v1/player',
    CLIENTS: {
        WEB: {
            NAME: 'WEB',
            VERSION: '2.20250222.10.00',
        },
        ANDROID: {
            NAME: 'ANDROID',
            VERSION: '19.30.36',
        },
        TV: {
            NAME: 'TVHTML5',
            VERSION: '7.20220918',
        }
    }
};

// Current API key
let currentApiKey: string = INNERTUBE.DEFAULT_API_KEY;

/**
 * Fetch fresh API key from YouTube's homepage
 */
const fetchFreshApiKey = async (logger?: any): Promise<string> => {
    logger?.debug('Fetching fresh API key from YouTube...');

    const response = await fetch('https://www.youtube.com', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch YouTube homepage: ${response.status}`);
    }

    const html = await response.text();

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
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    return Array.from({ length: 11 }, () =>
        chars.charAt(Math.floor(Math.random() * chars.length)),
    ).join('');
};

const getRandomUserAgent = (clientName: string): string => {
    if (clientName === 'ANDROID') {
        return 'com.google.android.youtube/19.30.36 (Linux; U; Android 14; en_US; Pixel 8 Pro; Build/UQ1A.240205.004) gzip';
    }
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
};

const decodeHtmlEntities = (text: string): string => {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
        .replace(/&#x([a-fA-F0-9]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
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
    playabilityStatus?: { status: string; reason?: string };
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
    client: { NAME: string; VERSION: string }
): Promise<PlayerResponse> => {
    const visitorData = generateVisitorData();
    const userAgent = getRandomUserAgent(client.NAME);

    const response = await fetch(`${INNERTUBE.API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': userAgent,
            'X-Youtube-Client-Version': client.VERSION,
            'X-Youtube-Client-Name': client.NAME === 'ANDROID' ? '3' : '1',
            'X-Goog-Visitor-Id': visitorData,
            'X-Goog-Api-Format-Version': '2',
            Origin: 'https://www.youtube.com',
            Referer: 'https://www.youtube.com/',
        },
        body: JSON.stringify({
            context: {
                client: {
                    hl: 'en',
                    gl: 'US',
                    clientName: client.NAME,
                    clientVersion: client.VERSION,
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

const fetchCaptionXml = async (baseUrl: string, videoId: string): Promise<string> => {
    const url = baseUrl.replace('&fmt=srv3', '');

    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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
    client: { NAME: string; VERSION: string },
    logger?: any,
): Promise<TranscriptItem[]> => {
    const playerData = await getPlayerResponse(videoId, apiKey, client);

    if (playerData.playabilityStatus?.status !== 'OK') {
        const reason = playerData.playabilityStatus?.reason || '';
        throw new Error(`Video not playable (${client.NAME}): ${playerData.playabilityStatus?.status}${reason ? ` - ${reason}` : ''}`);
    }

    const tracks = playerData.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

    if (tracks.length === 0) {
        throw new Error(`No subtitles available for this video (${client.NAME})`);
    }

    // Default to first track (usually English or auto-generated English)
    // Could enhance to filter by lang if input.lang is provided
    const track = tracks[0];
    logger?.debug(`Found caption track (${client.NAME}): ${track.name?.simpleText} (${track.languageCode})`);

    const xml = await fetchCaptionXml(track.baseUrl, videoId);
    const subtitles = parseXmlCaptions(xml);

    if (subtitles.length === 0) {
        throw new Error(`Failed to parse subtitles (${client.NAME})`);
    }

    return subtitles.map((s) => ({
        timestamp: formatTime(s.start),
        text: s.text,
    }));
};

export const getTranscriptHtml =
    (context: Context) =>
        async (input: GetTranscriptHtmlInput): Promise<GetTranscriptHtmlOutput> => {
            const { logger } = context;
            logger?.debug('getTranscriptHtml:start', { data: input });

            const videoId = input.videoId;

            // Try these clients in order
            const clientsToTry = [
                INNERTUBE.CLIENTS.ANDROID,
                INNERTUBE.CLIENTS.WEB,
                INNERTUBE.CLIENTS.TV,
            ];

            let lastError: Error | null = null;
            let segments: TranscriptItem[] = [];

            for (const client of clientsToTry) {
                const MAX_INNER_ATTEMPTS = 2; // Try each client twice (with fresh key)

                for (let attempt = 1; attempt <= MAX_INNER_ATTEMPTS; attempt++) {
                    try {
                        logger?.debug(
                            `Trying ${client.NAME} attempt ${attempt}/${MAX_INNER_ATTEMPTS} (API key: ${currentApiKey.slice(0, 10)}...)`,
                        );

                        segments = await tryExtractSubtitles(videoId, currentApiKey, client, logger);
                        break; // Success with this client
                    } catch (error: any) {
                        lastError = error instanceof Error ? error : new Error(String(error));
                        logger?.warn(`${client.NAME} attempt ${attempt} failed: ${lastError.message}`);

                        // Try fresh API key for the second attempt
                        if (attempt < MAX_INNER_ATTEMPTS) {
                            try {
                                currentApiKey = await fetchFreshApiKey(logger);
                            } catch (keyError) {
                                logger?.warn(`Failed to fetch new API key: ${keyError}`);
                            }
                        }
                    }
                }

                if (segments.length > 0) break; // Found segments, stop trying other clients
            }

            if (segments.length === 0) {
                throw new Error(
                    `Failed after trying all clients. Last error: ${lastError?.message}`,
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

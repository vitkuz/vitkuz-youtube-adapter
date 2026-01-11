#!/usr/bin/env npx tsx
/**
* YouTube Auto-Generated Subtitle Extractor
*
* Single-file script to extract subtitles from YouTube videos.
* Uses YouTube's InnerTube API - no external API keys needed.
*
* Usage:
*   npx tsx extract.ts <video-url-or-id>
*   npx tsx extract.ts https://www.youtube.com/watch?v=VIDEO_ID
*   npx tsx extract.ts VIDEO_ID
*
* Output files:
*   subtitles_VIDEO_ID.txt  - Plain text
*   subtitles_VIDEO_ID.srt  - SRT format
*   subtitles_VIDEO_ID.json - JSON with metadata
*/

import * as fs from 'node:fs/promises';

// =============================================================================
// Types
// =============================================================================

interface SubtitleEntry {
 start: number;
 duration: number;
 text: string;
}

interface ExtractResult {
 videoId: string;
 language: string;
 entries: number;
 subtitles: SubtitleEntry[];
 plainText: string;
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
const fetchFreshApiKey = async (): Promise<string> => {
 console.log('Fetching fresh API key from YouTube...');

 const response = await fetch('https://www.youtube.com', {
   headers: {
     'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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
     console.log(`Found new API key: ${match[1].slice(0, 10)}...`);
     return match[1];
   }
 }

 throw new Error('Could not find API key in YouTube page');
};

// =============================================================================
// Helper Functions
// =============================================================================

const extractVideoId = (input: string): string | null => {
 const patterns = [
   /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
   /^([a-zA-Z0-9_-]{11})$/,
 ];
 for (const pattern of patterns) {
   const match = input.match(pattern);
   if (match) return match[1];
 }
 return null;
};

const generateVisitorData = (): string => {
 const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
 return Array.from({ length: 11 }, () =>
   chars.charAt(Math.floor(Math.random() * chars.length))
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
   .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
   .replace(/&#x([a-fA-F0-9]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
};

// =============================================================================
// Core Extraction Logic
// =============================================================================

const getPlayerResponse = async (videoId: string, apiKey: string): Promise<PlayerResponse> => {
 const visitorData = generateVisitorData();

 const response = await fetch(`${INNERTUBE.API_URL}?key=${apiKey}`, {
   method: 'POST',
   headers: {
     'Content-Type': 'application/json',
     'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
     'X-Youtube-Client-Version': INNERTUBE.CLIENT_VERSION,
     'X-Youtube-Client-Name': '1',
     'X-Goog-Visitor-Id': visitorData,
     'Origin': 'https://www.youtube.com',
     'Referer': 'https://www.youtube.com/',
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

const fetchCaptionXml = async (baseUrl: string, videoId: string): Promise<string> => {
 const url = baseUrl.replace('&fmt=srv3', '');

 const response = await fetch(url, {
   headers: {
     'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
     'Referer': `https://www.youtube.com/watch?v=${videoId}`,
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

/**
* Core extraction logic (single attempt)
*/
const tryExtractSubtitles = async (videoId: string, apiKey: string): Promise<ExtractResult> => {
 const playerData = await getPlayerResponse(videoId, apiKey);

 if (playerData.playabilityStatus?.status !== 'OK') {
   throw new Error(`Video not playable: ${playerData.playabilityStatus?.status}`);
 }

 const tracks = playerData.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

 if (tracks.length === 0) {
   throw new Error('No subtitles available for this video');
 }

 const track = tracks[0];
 console.log(`Found: ${track.name?.simpleText} (${track.languageCode})`);

 const xml = await fetchCaptionXml(track.baseUrl, videoId);
 const subtitles = parseXmlCaptions(xml);

 if (subtitles.length === 0) {
   throw new Error('Failed to parse subtitles');
 }

 const plainText = subtitles.map((s) => s.text).join(' ');

 return {
   videoId,
   language: track.languageCode,
   entries: subtitles.length,
   subtitles,
   plainText,
 };
};

/**
* Extract subtitles with retry logic and automatic API key refresh
* Tries up to 3 times, fetching fresh API key on failure
*/
const extractSubtitles = async (videoInput: string): Promise<ExtractResult> => {
 const videoId = extractVideoId(videoInput);
 if (!videoId) {
   throw new Error('Invalid YouTube URL or video ID');
 }

 console.log(`Fetching subtitles for: ${videoId}`);

 const MAX_ATTEMPTS = 3;
 let lastError: Error | null = null;

 for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
   try {
     console.log(`Attempt ${attempt}/${MAX_ATTEMPTS} (API key: ${currentApiKey.slice(0, 10)}...)`);

     const result = await tryExtractSubtitles(videoId, currentApiKey);
     return result;

   } catch (error) {
     lastError = error instanceof Error ? error : new Error(String(error));
     console.log(`Attempt ${attempt} failed: ${lastError.message}`);

     // If not last attempt, try to get fresh API key
     if (attempt < MAX_ATTEMPTS) {
       try {
         currentApiKey = await fetchFreshApiKey();
         console.log('Retrying with new API key...\n');
       } catch (keyError) {
         console.log(`Failed to fetch new API key: ${keyError}`);
       }
     }
   }
 }

 throw new Error(`Failed after ${MAX_ATTEMPTS} attempts. Last error: ${lastError?.message}`);
};

// =============================================================================
// Output Formatters
// =============================================================================

const formatSRT = (subtitles: SubtitleEntry[]): string => {
 const formatTime = (seconds: number): string => {
   const h = Math.floor(seconds / 3600);
   const m = Math.floor((seconds % 3600) / 60);
   const s = Math.floor(seconds % 60);
   const ms = Math.floor((seconds % 1) * 1000);
   return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
 };

 return subtitles
   .map((entry, idx) => {
     const start = formatTime(entry.start);
     const end = formatTime(entry.start + entry.duration);
     return `${idx + 1}\n${start} --> ${end}\n${entry.text}\n`;
   })
   .join('\n');
};

// =============================================================================
// Main
// =============================================================================

const main = async (): Promise<void> => {
 const input = process.argv[2];

 if (!input) {
   console.log('YouTube Subtitle Extractor\n');
   console.log('Usage:');
   console.log('  npx tsx extract.ts <video-url-or-id>\n');
   console.log('Examples:');
   console.log('  npx tsx extract.ts https://www.youtube.com/watch?v=dQw4w9WgXcQ');
   console.log('  npx tsx extract.ts dQw4w9WgXcQ');
   process.exit(1);
 }

 try {
   const result = await extractSubtitles(input);

   console.log(`Extracted ${result.entries} subtitle entries\n`);

   // Save plain text
   const txtFile = `subtitles_${result.videoId}.txt`;
   await fs.writeFile(txtFile, result.plainText);
   console.log(`Saved: ${txtFile}`);

   // Save SRT
   const srtFile = `subtitles_${result.videoId}.srt`;
   await fs.writeFile(srtFile, formatSRT(result.subtitles));
   console.log(`Saved: ${srtFile}`);

   // Save JSON
   const jsonFile = `subtitles_${result.videoId}.json`;
   await fs.writeFile(jsonFile, JSON.stringify(result, null, 2));
   console.log(`Saved: ${jsonFile}`);

   console.log('\nDone!');
 } catch (error) {
   console.error('Error:', error instanceof Error ? error.message : error);
   process.exit(1);
 }
};

main();

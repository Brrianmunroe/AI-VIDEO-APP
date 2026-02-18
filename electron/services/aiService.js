/**
 * AI Service
 * Orchestrates transcription + LLM to generate per-clip selects (highlights).
 */

import * as mediaService from './mediaService.js';
import * as transcriptionService from './transcriptionService.js';
import { callLLM } from './llmClient.js';

const LINE_GAP_THRESHOLD_SEC = 0.5;
const MAX_WORDS_PER_LINE = 14;

function wordEndsSentence(word) {
  if (word == null || typeof word !== 'string') return false;
  const t = String(word).trim();
  return t.length > 0 && /[.!?]$/.test(t);
}

/**
 * Convert words array to transcript segments { start, end, text } for token efficiency.
 */
function wordsToTranscriptSegments(words) {
  if (!Array.isArray(words) || words.length === 0) return [];
  const normalized = words.map((w) => ({
    word: typeof w.word === 'string' ? w.word : String(w.word ?? ''),
    start: Number(w.start) || 0,
    end: Number(w.end) || 0,
  }));
  const trimmedSingleWord = (w) => !/\s/.test((w.word || '').trim()) && (w.word || '').trim().length > 0;
  const noSpaces = normalized.filter(trimmedSingleWord).length;
  const isWordLevel = normalized.length > 8 && noSpaces / normalized.length >= 0.85;

  if (!isWordLevel) {
    return normalized.map((w) => ({
      start: w.start,
      end: w.end,
      text: w.word,
    }));
  }

  const segments = [];
  let lineWords = [normalized[0]];
  for (let i = 1; i < normalized.length; i++) {
    const prev = normalized[i - 1];
    const curr = normalized[i];
    const gap = curr.start - prev.end;
    const prevEndsSentence = wordEndsSentence(prev.word);
    const atMaxWords = lineWords.length >= MAX_WORDS_PER_LINE;
    const shouldBreak = (prevEndsSentence || gap > LINE_GAP_THRESHOLD_SEC || atMaxWords) && lineWords.length > 0;
    if (shouldBreak) {
      const first = lineWords[0];
      const last = lineWords[lineWords.length - 1];
      segments.push({
        start: first.start,
        end: last.end,
        text: lineWords.map((w) => w.word).join(' '),
      });
      lineWords = [];
    }
    lineWords.push(curr);
  }
  if (lineWords.length > 0) {
    const first = lineWords[0];
    const last = lineWords[lineWords.length - 1];
    segments.push({
      start: first.start,
      end: last.end,
      text: lineWords.map((w) => w.word).join(' '),
    });
  }
  return segments;
}

function generateHighlightId() {
  return `highlight_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

const SYSTEM_PROMPT = `You are an assistant video editor. Your job is to read interview transcripts and propose story "selects": short highlight ranges (in seconds) for each clip. You MUST:
- Follow the project brief and user instructions.
- Prioritize storytelling clarity, emotional impact, and on-topic answers.
- Avoid repetition; prefer fewer, stronger moments over many weak ones.
- When multiple speakers/clips exist, prefer diversity of voices unless one clip is clearly stronger for the story.
- Output ONLY valid JSON matching the schema provided. No explanations or commentary outside JSON.
- Use continuous ranges only (no internal gaps); the editor will fine-cut filler later.`;

/**
 * Generate selects for a project using the LLM.
 * @param {{
 *   projectId: number,
 *   storyContext: string,
 *   styleContext: string,
 *   userInstructions?: string,
 *   desiredDurationSec?: number
 * }} options
 * @returns {Promise<{ success: boolean, summary?: { clipsWithHighlights: number, totalRanges: number }, error?: string }>}
 */
export async function generateSelectsForProject({
  projectId,
  storyContext,
  styleContext,
  userInstructions = '',
  desiredDurationSec = 120,
}) {
  // 1. Ensure transcripts exist
  const transResult = await transcriptionService.runForProject(projectId);
  if (transResult?.errors?.length > 0) {
    console.warn('[aiService] Transcription had errors:', transResult.errors);
  }

  // 2. Load media and transcripts
  const mediaList = mediaService.getMediaByProject(projectId);
  const transcripts = transcriptionService.getTranscriptsByProject(projectId);
  const transcriptByMediaId = new Map(transcripts.map((t) => [t.mediaId, t]));

  const clips = [];
  for (const m of mediaList) {
    const t = transcriptByMediaId.get(m.id);
    const words = t?.words ?? [];
    const segments = wordsToTranscriptSegments(words);
    if (segments.length === 0 && words.length === 0) continue;
    clips.push({
      mediaId: m.id,
      name: m.clipName || m.name || `Clip ${m.id}`,
      durationSec: Number(m.duration) || 0,
      transcript: segments,
    });
  }

  if (clips.length === 0) {
    return { success: false, error: 'No transcripts available. Run transcription first.' };
  }

  const userPayload = {
    project_context: {
      story_context: (storyContext || '').trim() || 'General interview; select the best moments.',
      style_context: (styleContext || '').trim() || 'Standard pace; clear and concise.',
      user_instructions: (userInstructions || '').trim() || '',
      desired_video_duration_sec: Math.max(15, Math.min(600, Number(desiredDurationSec) || 120)),
      max_highlights_per_clip: 5,
      min_highlight_duration_sec: 3,
      max_highlight_duration_sec: 40,
    },
    clips,
    output_schema: {
      type: 'object',
      required: ['highlights'],
      properties: {
        highlights: {
          type: 'array',
          items: {
            type: 'object',
            required: ['mediaId', 'ranges'],
            properties: {
              mediaId: { type: 'number' },
              ranges: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['in', 'out'],
                  properties: {
                    in: { type: 'number' },
                    out: { type: 'number' },
                    reason: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  const instructions =
    'Using the information above, produce selects. Respect desired_video_duration_sec (aim within ~20%). Prefer fewer, stronger ranges. in/out must be in seconds from clip start, within each clip durationSec. Return ONLY a JSON object with a "highlights" array. No Markdown, no comments.';

  const userContent = JSON.stringify(userPayload, null, 0) + '\n\n' + instructions;

  let rawText;
  try {
    rawText = await callLLM({
      provider: 'openai',
      systemPrompt: SYSTEM_PROMPT,
      userPayload: userContent,
    });
  } catch (err) {
    const msg = err?.message || String(err);
    console.error('[aiService] LLM call failed:', msg);
    return { success: false, error: msg };
  }

  // 3. Parse and validate response
  let parsed;
  try {
    const cleaned = rawText.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error('[aiService] Failed to parse LLM response:', rawText?.slice(0, 500));
    return { success: false, error: 'AI returned invalid JSON. Try again.' };
  }

  const highlightsArr = Array.isArray(parsed?.highlights) ? parsed.highlights : [];
  const mediaById = new Map(mediaList.map((m) => [m.id, m]));

  let clipsWithHighlights = 0;
  let totalRanges = 0;

  for (const item of highlightsArr) {
    const mediaId = item.mediaId;
    const media = mediaById.get(mediaId);
    if (!media) continue;

    const durationSec = Number(media.duration) || 0;
    const ranges = Array.isArray(item.ranges) ? item.ranges : [];

    const validHighlights = [];
    for (const r of ranges) {
      const inSec = Math.max(0, Math.min(durationSec, Number(r.in) || 0));
      const outSec = Math.max(inSec, Math.min(durationSec, Number(r.out) || inSec));
      if (outSec - inSec < 1) continue;
      validHighlights.push({
        id: generateHighlightId(),
        in: inSec,
        out: outSec,
      });
    }

    if (validHighlights.length > 0) {
      mediaService.updateMediaHighlights(mediaId, validHighlights);
      clipsWithHighlights++;
      totalRanges += validHighlights.length;
    }
  }

  return {
    success: true,
    summary: { clipsWithHighlights, totalRanges },
  };
}

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

/**
 * Snap in/out to transcript segment boundaries so we never cut mid-word or mid-phrase.
 * @param {number} inSec
 * @param {number} outSec
 * @param {Array<{ start: number, end: number }>} segments
 * @param {number} durationSec
 * @returns {{ in: number, out: number } | null} Snapped values, or null if invalid
 */
function snapToSegmentBoundaries(inSec, outSec, segments, durationSec) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return { in: inSec, out: outSec };
  }

  const first = segments[0];
  const last = segments[segments.length - 1];

  // Range entirely before or after transcript -> skip
  if (outSec <= first.start || inSec >= last.end) return null;

  let snappedIn = inSec;
  let snappedOut = outSec;

  // Snap in: find segment containing inSec, or start of next segment if in a gap
  for (const seg of segments) {
    if (inSec <= seg.end) {
      snappedIn = seg.start;
      break;
    }
  }
  if (inSec < first.start) snappedIn = first.start;

  // Snap out: find segment containing outSec, or end of previous segment if in a gap
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (outSec >= seg.start) {
      snappedOut = seg.end;
      break;
    }
  }
  if (outSec > last.end) snappedOut = Math.min(durationSec, last.end);

  if (snappedIn >= snappedOut) return null;
  return { in: snappedIn, out: snappedOut };
}

const SYSTEM_PROMPT = `You are an assistant video editor. Your job is to read interview transcripts and propose story "selects": highlight ranges (in seconds) for each clip. You MUST:

- Prioritize moments that directly address the story context, style context, and user instructions. Avoid selecting content that is only loosely related. If the user specifies a focus (e.g., pricing, origin story, key message), prioritize those that stick to that focus, but you may also include other moments you judge to be valuable for the story.

- Each highlight should be one unit of meaning: one complete thought, story, anecdote, or point. If a stretch of transcript has multiple distinct points bundled together, split them into separate highlights. If it is one coherent narrative (e.g., a full anecdote that runs 45 seconds), keep it as one highlight. Use content and context to decide—no rigid duration rules.

- Do not cut mid-word or mid-thought.

- Prioritize key moments that fit the story. Use the specified video length as a guide, but it is acceptable to select more content than the target if the best material warrants it—the user can pare down. The main goal is to surface the strongest, story-relevant moments. Avoid including weak or tangential content that adds length without adding value.

- When multiple speakers/clips exist, prefer diversity of voices unless one clip is clearly stronger for the story.

- For every highlight range you MUST include two text fields: "reason" (one short sentence explaining why this moment was selected) and "suggestions" (short phrases for how to use the clip in the edit, e.g. "Good for intro" or "Strong quote for social"). Never omit reason or suggestions; they are required and shown to the user.

- Output ONLY valid JSON matching the schema provided. No explanations or commentary outside JSON.
- Use continuous ranges only (no internal gaps); the editor will fine-cut filler later.`;

/** OpenAI structured-output schema: enforces highlights array with reason and suggestions per range. */
const HIGHLIGHTS_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'highlight_selects',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        highlights: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              mediaId: { type: 'number' },
              ranges: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    in: { type: 'number' },
                    out: { type: 'number' },
                    reason: { type: 'string' },
                    suggestions: { type: 'string' },
                  },
                  required: ['in', 'out', 'reason', 'suggestions'],
                  additionalProperties: false,
                },
              },
            },
            required: ['mediaId', 'ranges'],
            additionalProperties: false,
          },
        },
      },
      required: ['highlights'],
      additionalProperties: false,
    },
  },
};

/**
 * Derive max_highlights_per_clip and max_highlight_duration_sec from desired duration.
 * Shorter targets -> fewer, shorter highlights. Longer targets -> more, longer allowed.
 */
function getDurationConstraints(desiredDurationSec) {
  const sec = Math.max(15, Math.min(600, Number(desiredDurationSec) || 120));
  if (sec <= 60) {
    return { maxHighlightsPerClip: 4, maxHighlightDurationSec: 20 };
  }
  if (sec <= 180) {
    return { maxHighlightsPerClip: 6, maxHighlightDurationSec: 40 };
  }
  if (sec <= 300) {
    return { maxHighlightsPerClip: 8, maxHighlightDurationSec: 60 };
  }
  return { maxHighlightsPerClip: 10, maxHighlightDurationSec: 60 };
}

/**
 * Get duration-aware prompt guidance for the LLM.
 */
function getDurationGuidance(desiredDurationSec) {
  const sec = Math.max(15, Math.min(600, Number(desiredDurationSec) || 120));
  if (sec <= 60) {
    return 'For this short target (15–60 sec), select only the strongest 2–4 moments per clip, each 5–15 seconds. Be highly selective.';
  }
  if (sec <= 180) {
    return 'For this medium target (1–3 min), aim for 4–6 highlights per clip, typically 15–30 seconds each. Prioritize the best material.';
  }
  if (sec <= 300) {
    return 'For this longer target (4–5 min), include more moments per clip (6–8), allowing highlights up to 45–60 seconds where the content warrants it.';
  }
  return 'For 5+ minutes, select generously—up to 10 highlights per clip, allowing longer clips (20–60 sec) for full thoughts and anecdotes.';
}

/**
 * Generate selects for a project using the LLM.
 * @param {{
 *   projectId: number,
 *   storyContext: string,
 *   desiredDurationSec?: number,
 *   onProgress?: function
 * }} options
 * @returns {Promise<{ success: boolean, summary?: { clipsWithHighlights: number, totalRanges: number }, error?: string }>}
 */
export async function generateSelectsForProject({
  projectId,
  storyContext,
  desiredDurationSec = 120,
  onProgress,
}) {
  const report = (stepIndex, step, progress, label) => {
    if (typeof onProgress === 'function') onProgress({ stepIndex, step, progress, label });
  };

  // 1. Ensure transcripts exist
  report(0, 'transcribing', 5, 'Transcribing audio');
  const transResult = await transcriptionService.runForProject(projectId);
  report(0, 'transcribing', 25, 'Transcribing audio');
  if (transResult?.errors?.length > 0) {
    console.warn('[aiService] Transcription had errors:', transResult.errors);
  }

  // 2. Load media and transcripts
  report(1, 'preparing', 28, 'Preparing transcripts');
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
  report(1, 'preparing', 35, 'Preparing transcripts');

  const desiredSec = Math.max(15, Math.min(600, Number(desiredDurationSec) || 120));
  const { maxHighlightsPerClip, maxHighlightDurationSec } = getDurationConstraints(desiredDurationSec);
  const durationGuidance = getDurationGuidance(desiredDurationSec);

  const userPayload = {
    project_context: {
      story_context: (storyContext || '').trim() || 'General interview; select the best moments.',
      style_context: 'Standard pace; clear and concise.',
      user_instructions: '',
      desired_video_duration_sec: desiredSec,
      max_highlights_per_clip: maxHighlightsPerClip,
      min_highlight_duration_sec: 1,
      max_highlight_duration_sec: maxHighlightDurationSec,
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
                  required: ['in', 'out', 'reason', 'suggestions'],
                  properties: {
                    in: { type: 'number' },
                    out: { type: 'number' },
                    reason: { type: 'string', description: 'Why this moment was selected' },
                    suggestions: { type: 'string', description: 'How to use this clip, e.g. Good for intro; Strong quote for social' },
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
    `${durationGuidance} Using the information above, produce selects. Respect max_highlights_per_clip and max_highlight_duration_sec—they vary by desired video length. Prioritize the strongest story-relevant moments. in/out must be in seconds from clip start, within each clip durationSec. For EVERY range you must include: "reason" (one short sentence why this moment was selected) and "suggestions" (how to use it, e.g. "Good for intro; Strong quote for social"). Example range: {"in": 5.2, "out": 18.4, "reason": "Clear explanation of product pricing.", "suggestions": "Good for intro; Use in pricing section."}. Return ONLY a JSON object with a "highlights" array. No Markdown, no comments.`;

  const userContent = JSON.stringify(userPayload, null, 0) + '\n\n' + instructions;

  report(2, 'analyzing', 38, 'Analyzing with AI');
  let rawText;
  try {
    rawText = await callLLM({
      provider: 'openai',
      systemPrompt: SYSTEM_PROMPT,
      userPayload: userContent,
      responseFormat: HIGHLIGHTS_RESPONSE_FORMAT,
    });
  } catch (err) {
    const msg = err?.message || String(err);
    console.error('[aiService] LLM call failed:', msg);
    return { success: false, error: msg };
  }
  report(2, 'analyzing', 85, 'Analyzing with AI');

  // 3. Parse and validate response
  report(3, 'refining', 88, 'Refining selections');
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
  const segmentsByMediaId = new Map(clips.map((c) => [c.mediaId, c.transcript]));
  report(3, 'refining', 95, 'Refining selections');

  let clipsWithHighlights = 0;
  let totalRanges = 0;

  for (const item of highlightsArr) {
    const mediaId = item.mediaId;
    const media = mediaById.get(mediaId);
    if (!media) continue;

    const durationSec = Number(media.duration) || 0;
    const ranges = Array.isArray(item.ranges) ? item.ranges : [];
    const segments = segmentsByMediaId.get(mediaId) ?? [];

    const validHighlights = [];
    let ordinal = 1;
    for (const r of ranges) {
      let inSec = Math.max(0, Math.min(durationSec, Number(r.in) || 0));
      let outSec = Math.max(inSec, Math.min(durationSec, Number(r.out) || inSec));

      const snapped = snapToSegmentBoundaries(inSec, outSec, segments, durationSec);
      if (snapped === null) continue;
      inSec = snapped.in;
      outSec = snapped.out;

      if (outSec - inSec < 1) continue;
      const reason =
        typeof r.reason === 'string' && r.reason.trim() ? r.reason.trim() : '';
      const suggestions =
        typeof r.suggestions === 'string' && r.suggestions.trim()
          ? r.suggestions.trim()
          : '';
      validHighlights.push({
        id: generateHighlightId(),
        in: inSec,
        out: outSec,
        reason,
        suggestions,
        ordinal,
        status: 'pending',
      });
      ordinal++;
    }

    if (validHighlights.length > 0) {
      mediaService.updateMediaHighlights(mediaId, validHighlights);
      clipsWithHighlights++;
      totalRanges += validHighlights.length;
    }
  }

  report(4, 'saving', 100, 'Saving highlights');
  return {
    success: true,
    summary: { clipsWithHighlights, totalRanges },
  };
}

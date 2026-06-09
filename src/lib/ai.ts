import type { CapabilityBet, EvidencePolarity, Idea } from '../store';
import { apiUrl, buildApiHeaders } from './apiClient';

type RuntimeConfig = {
  baseUrl: string;
  model: string;
  apiKey: string;
};

type ViteEnvLike = Record<string, string | boolean | undefined>;

function readEnv(key: string, fallback = '') {
  const env = ((import.meta as ImportMeta & { env?: ViteEnvLike }).env ?? {}) as ViteEnvLike;
  return String(env[`VITE_${key}`] ?? env[key] ?? fallback).trim();
}

function getRuntimeConfig(): RuntimeConfig {
  const baseUrl = readEnv('AI_BASE_URL', readEnv('GEMMA_BASE_URL', apiUrl('/api/gemma'))).replace(/\/+$/, '');
  const model = readEnv('AI_MODEL', readEnv('GEMMA_MODEL', 'gemma4:latest'));
  const apiKey = readEnv('GEMMA_API_KEY', 'not-required');
  return { baseUrl, model, apiKey };
}

export function getGemmaRuntimeStatus() {
  const config = getRuntimeConfig();
  const hasLocalBaseUrl = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(`${config.baseUrl}/`);
  return {
    ...config,
    configured: Boolean(config.baseUrl && config.model),
    local: hasLocalBaseUrl,
    chatCompletionsUrl: `${config.baseUrl}/chat/completions`,
  };
}

function buildRuntimeError(prefix: string, detail?: string) {
  const status = getGemmaRuntimeStatus();
  const hint = `AI config -> baseUrl=${status.baseUrl}, model=${status.model}. Set VITE_AI_BASE_URL / VITE_AI_MODEL in .env.local if needed.`;
  return new Error(`${prefix}${detail ? ` ${detail}` : ''} ${hint}`.trim());
}

function extractJsonObject(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = (fencedMatch?.[1] ?? trimmed).trim();

  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return candidate.slice(firstBrace, lastBrace + 1);
  }

  return candidate;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTopTerms(value: string, maxItems = 6) {
  const counts = new Map<string, number>();
  for (const token of normalizeText(value).split(' ')) {
    if (token.length < 4) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxItems)
    .map(([token]) => token);
}

type ExtractionReviewPayload = {
  source: 'ai' | 'heuristic' | 'hybrid';
  themes: string[];
  entities: string[];
  capabilityCandidates: Array<{
    capabilityBetId: string;
    title: string;
    polarity: EvidencePolarity;
    summary: string;
    rationale: string;
    suggestedWeight: number;
  }>;
  ideaCandidates: Array<{
    ideaId: string;
    title: string;
    relation: 'base-skill' | 'umbrella-goal' | 'idea';
    rationale: string;
  }>;
};

function inferExtractionPolarity(noteContent: string): EvidencePolarity {
  const content = noteContent.toLowerCase();
  if (/(not now|too early|unlikely|no edge|waste|avoid|bad bet|weak signal)/.test(content)) return 'contradicts';
  if (/(hard|costly|difficult|tradeoff|however|but|unclear|mixed)/.test(content)) return 'complicates';
  return 'supports';
}

function buildHeuristicExtractionReview(input: {
  noteContent: string;
  capabilityBets: Array<Pick<CapabilityBet, 'id' | 'title' | 'thesis' | 'keywords'>>;
  ideas: Array<Pick<Idea, 'id' | 'title' | 'summary' | 'type' | 'strategicRole'>>;
}): ExtractionReviewPayload {
  const normalizedNote = normalizeText(input.noteContent);
  const themes = getTopTerms(input.noteContent, 6);
  const entities = Array.from(new Set(
    input.noteContent
      .match(/\b[A-Z][a-zA-Z0-9-]{2,}\b/g)
      ?.map((token) => token.trim())
      .slice(0, 6) ?? [],
  ));
  const polarity = inferExtractionPolarity(input.noteContent);

  const capabilityCandidates = input.capabilityBets
    .map((bet) => {
      const titleTokens = getTopTerms(bet.title, 4);
      const keywordHits = bet.keywords.filter((keyword) => normalizedNote.includes(keyword.toLowerCase())).length;
      const titleHits = titleTokens.filter((token) => normalizedNote.includes(token)).length;
      const thesisHits = getTopTerms(bet.thesis, 4).filter((token) => normalizedNote.includes(token)).length;
      const score = keywordHits * 3 + titleHits * 2 + thesisHits;
      if (!score) return null;

      return {
        capabilityBetId: bet.id,
        title: bet.title,
        polarity,
        summary: input.noteContent.replace(/\s+/g, ' ').trim().slice(0, 160),
        rationale: `Heuristic match from ${keywordHits} keyword hits, ${titleHits} title-token hits, and ${thesisHits} thesis-token hits.`,
        suggestedWeight: clamp(30 + score * 10, 20, 95),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b?.suggestedWeight ?? 0) - (a?.suggestedWeight ?? 0))
    .slice(0, 4) as ExtractionReviewPayload['capabilityCandidates'];

  const ideaCandidates = input.ideas
    .map((idea) => {
      const titleTerms = getTopTerms(`${idea.title} ${idea.summary}`, 6);
      const matches = titleTerms.filter((token) => normalizedNote.includes(token));
      if (!matches.length) return null;

      return {
        ideaId: idea.id,
        title: idea.title,
        relation: idea.type === 'Base Skill' || idea.strategicRole === 'Base'
          ? 'base-skill'
          : idea.type === 'Umbrella Goal'
            ? 'umbrella-goal'
            : 'idea',
        rationale: `Heuristic overlap on ${matches.slice(0, 4).join(', ')}.`,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b?.rationale.length ?? 0) - (a?.rationale.length ?? 0))
    .slice(0, 6) as ExtractionReviewPayload['ideaCandidates'];

  return {
    source: 'heuristic',
    themes,
    entities,
    capabilityCandidates,
    ideaCandidates,
  };
}

export function buildMemoryShapedSystemInstruction(extraGuidance?: string) {
  const base = `You are the HumanBoard Librarian assistant.

Answer as if you have memory, distilled principles, and ongoing intellectual digestion, not like a search engine dumping retrieved snippets.

Behavior rules:
- Treat Principles as the deepest memory layer. Let them shape your answer first when relevant.
- Treat active Reflections as signs of ongoing digestion, recurring tensions, or unresolved patterns.
- Treat Ideas, Goals, and Projects as the working memory of the board.
- Treat raw Notes as supporting evidence, not the main voice.
- Synthesize. Do not list every relevant item unless the user asks.
- Prefer: worldview -> interpretation -> practical answer.
- When useful, explicitly say what principle or pattern seems to be driving your answer.
- Sound like someone who has been thinking over time, not someone doing one-off retrieval.
- Do not pretend to remember things that are not in the provided HumanBoard context.
- Be concise, calm, actionable, and do not use markdown tables.`;

  return [base, extraGuidance?.trim()].filter(Boolean).join('\n\n');
}

async function callGemma(prompt: string, systemInstruction: string) {
  const runtime = getGemmaRuntimeStatus();
  if (!runtime.configured) {
    throw buildRuntimeError('AI runtime is not configured.');
  }

  const requestHeaders = runtime.chatCompletionsUrl.startsWith(apiUrl('/api/'))
    ? buildApiHeaders({ 'Content-Type': 'application/json' })
    : {
        'Content-Type': 'application/json',
        ...(runtime.apiKey ? { Authorization: `Bearer ${runtime.apiKey}` } : {}),
      };

  let response: Response;
  try {
    response = await fetch(runtime.chatCompletionsUrl, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({
        model: runtime.model,
        temperature: 0.4,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: prompt },
        ],
      }),
    });
  } catch (error) {
    throw buildRuntimeError('Could not reach the AI runtime.', error instanceof Error ? error.message : String(error));
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("Daily AI Request Limit Reached: You have reached the maximum of 1,000 AI interactions for today. Your quota resets at midnight UTC.");
    }
    const errorText = await response.text();
    throw buildRuntimeError(`AI request failed with HTTP ${response.status}.`, errorText);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (payload.error?.message) {
    throw buildRuntimeError('AI runtime returned an API error.', payload.error.message);
  }

  const content = payload.choices?.[0]?.message?.content?.trim() || '';
  if (!content) {
    throw buildRuntimeError('AI runtime returned an empty response.');
  }
  return content;
}

export type AIAction =
  | 'summarize'
  | 'improve'
  | 'fix_grammar'
  | 'continue'
  | 'brainstorm'
  | 'shorten'
  | 'lengthen'
  | 'change_tone_professional'
  | 'change_tone_casual';

export async function askGemma(prompt: string, systemInstruction?: string) {
  return callGemma(
    prompt,
    systemInstruction || buildMemoryShapedSystemInstruction()
  );
}

export async function analyzeImageToNote(imageDataUrl: string, fileName: string, userContext = '') {
  const runtime = getRuntimeConfig();
  const imageModel = readEnv('IMAGE_ANALYSIS_MODEL', 'gpt-4o-mini');
  const endpoint = `${runtime.baseUrl}/chat/completions`;
  const requestHeaders = endpoint.startsWith(apiUrl('/api/'))
    ? buildApiHeaders({ 'Content-Type': 'application/json' })
    : {
        'Content-Type': 'application/json',
        ...(runtime.apiKey ? { Authorization: `Bearer ${runtime.apiKey}` } : {}),
      };

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({
        model: imageModel,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: `Turn an uploaded image into one durable HumanBoard inbox note.

Return plain text only. Include a concise descriptive title on the first line, all useful visible text, the image's meaning or actionable insight, and uncertainty when something is unclear. Preserve important numbers and names. Do not use markdown fences.`,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Create an inbox note from this image. Original file name: ${fileName}.${userContext.trim() ? ` User context: ${userContext.trim()}` : ''}`,
              },
              { type: 'image_url', image_url: { url: imageDataUrl } },
            ],
          },
        ],
      }),
    });
  } catch (error) {
    throw buildRuntimeError('Could not reach the image-analysis runtime.', error instanceof Error ? error.message : String(error));
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("Daily AI Request Limit Reached: You have reached the maximum of 1,000 AI interactions for today. Your quota resets at midnight UTC.");
    }
    throw buildRuntimeError(`Image analysis failed with HTTP ${response.status}.`, await response.text());
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (payload.error?.message || !content) {
    throw buildRuntimeError('Image analysis returned no usable note.', payload.error?.message);
  }
  return content;
}

export async function extractCapabilityEvidenceReview(input: {
  noteContent: string;
  capabilityBets: Array<Pick<CapabilityBet, 'id' | 'title' | 'thesis' | 'keywords'>>;
  ideas: Array<Pick<Idea, 'id' | 'title' | 'summary' | 'type' | 'strategicRole'>>;
}): Promise<ExtractionReviewPayload> {
  const heuristic = buildHeuristicExtractionReview(input);
  const runtime = getGemmaRuntimeStatus();
  if (!runtime.configured) return heuristic;

  const capabilityShortlist = heuristic.capabilityCandidates.length
    ? heuristic.capabilityCandidates.map((candidate) => {
      const bet = input.capabilityBets.find((entry) => entry.id === candidate.capabilityBetId);
      return {
        id: candidate.capabilityBetId,
        title: candidate.title,
        thesis: bet?.thesis ?? '',
        keywords: bet?.keywords ?? [],
      };
    })
    : input.capabilityBets.slice(0, 4);

  const ideaShortlist = heuristic.ideaCandidates.length
    ? heuristic.ideaCandidates.map((candidate) => {
      const idea = input.ideas.find((entry) => entry.id === candidate.ideaId);
      return idea ? {
        id: idea.id,
        title: idea.title,
        summary: idea.summary,
        type: idea.type,
        strategicRole: idea.strategicRole,
      } : null;
    }).filter(Boolean)
    : input.ideas.slice(0, 8);

  if (!capabilityShortlist.length && !ideaShortlist.length) {
    return heuristic;
  }

  const prompt = `Review this HumanBoard raw note and propose reviewable extraction candidates. Stay conservative.

Raw note:
"""
${input.noteContent}
"""

Capability shortlist:
${JSON.stringify(capabilityShortlist, null, 2)}

Idea shortlist:
${JSON.stringify(ideaShortlist, null, 2)}

Return valid JSON with exactly these keys:
- themes: array of short strings
- entities: array of short strings
- capabilityCandidates: array of objects with capabilityBetId, polarity, summary, rationale, suggestedWeight
- ideaCandidates: array of objects with ideaId, relation, rationale

Rules:
- Only use ids from the provided shortlists.
- Keep capabilityCandidates empty when the note is too weak or ambiguous.
- polarity must be one of supports, contradicts, complicates.
- relation must be one of base-skill, umbrella-goal, idea.
- suggestedWeight must be an integer from 15 to 95.
- summary should explain the evidence claim in under 160 characters.
- rationale should be brief and specific.
- Return JSON only.`;

  try {
    const raw = await callGemma(
      prompt,
      buildMemoryShapedSystemInstruction('You are reviewing extraction candidates for HumanBoard. Prefer precision over recall. Return only valid JSON.')
    );

    const parsed = JSON.parse(extractJsonObject(raw || '{}')) as {
      themes?: string[];
      entities?: string[];
      capabilityCandidates?: Array<{
        capabilityBetId?: string;
        polarity?: EvidencePolarity;
        summary?: string;
        rationale?: string;
        suggestedWeight?: number;
      }>;
      ideaCandidates?: Array<{
        ideaId?: string;
        relation?: 'base-skill' | 'umbrella-goal' | 'idea';
        rationale?: string;
      }>;
    };

    const capabilityMap = new Map(input.capabilityBets.map((bet) => [bet.id, bet]));
    const ideaMap = new Map(input.ideas.map((idea) => [idea.id, idea]));

    const capabilityCandidates = (parsed.capabilityCandidates ?? [])
      .map((candidate) => {
        const bet = candidate.capabilityBetId ? capabilityMap.get(candidate.capabilityBetId) : null;
        if (!bet || !candidate.polarity) return null;
        return {
          capabilityBetId: bet.id,
          title: bet.title,
          polarity: candidate.polarity,
          summary: String(candidate.summary || input.noteContent).replace(/\s+/g, ' ').trim().slice(0, 160),
          rationale: String(candidate.rationale || 'AI-assisted extraction review.').trim(),
          suggestedWeight: clamp(Math.round(Number(candidate.suggestedWeight) || 45), 15, 95),
        };
      })
      .filter(Boolean) as ExtractionReviewPayload['capabilityCandidates'];

    const ideaCandidates = (parsed.ideaCandidates ?? [])
      .map((candidate) => {
        const idea = candidate.ideaId ? ideaMap.get(candidate.ideaId) : null;
        if (!idea || !candidate.relation) return null;
        return {
          ideaId: idea.id,
          title: idea.title,
          relation: candidate.relation,
          rationale: String(candidate.rationale || 'AI-assisted extraction review.').trim(),
        };
      })
      .filter(Boolean) as ExtractionReviewPayload['ideaCandidates'];

    return {
      source: heuristic.capabilityCandidates.length || heuristic.ideaCandidates.length ? 'hybrid' : 'ai',
      themes: Array.from(new Set([...(parsed.themes ?? []), ...heuristic.themes])).slice(0, 6),
      entities: Array.from(new Set([...(parsed.entities ?? []), ...heuristic.entities])).slice(0, 6),
      capabilityCandidates: capabilityCandidates.length ? capabilityCandidates : heuristic.capabilityCandidates,
      ideaCandidates: ideaCandidates.length ? ideaCandidates : heuristic.ideaCandidates,
    };
  } catch {
    return heuristic;
  }
}

export async function performAIAction(action: AIAction, content: string, title?: string): Promise<string> {
  let prompt = '';

  switch (action) {
    case 'summarize':
      prompt = `Summarize the following content concisely while preserving the core meaning:\n\n${content}`;
      break;
    case 'improve':
      prompt = `Improve the writing of the following content. Make it clearer, more engaging, and more professional while keeping the original intent:\n\n${content}`;
      break;
    case 'fix_grammar':
      prompt = `Fix any grammar, spelling, and punctuation errors in the following content:\n\n${content}`;
      break;
    case 'continue':
      prompt = `Continue writing based on the following content. Maintain the same style and tone:\n\n${content}`;
      break;
    case 'brainstorm':
      prompt = `Based on the following idea titled "${title || 'Untitled'}", brainstorm 5 related concepts, experiments, or next steps:\n\n${content}`;
      break;
    case 'shorten':
      prompt = `Make the following content significantly shorter and more concise:\n\n${content}`;
      break;
    case 'lengthen':
      prompt = `Expand on the following content by adding more detail, examples, and depth:\n\n${content}`;
      break;
    case 'change_tone_professional':
      prompt = `Rewrite the following content in a professional and formal tone:\n\n${content}`;
      break;
    case 'change_tone_casual':
      prompt = `Rewrite the following content in a casual and friendly tone:\n\n${content}`;
      break;
  }

  return callGemma(
    prompt,
    buildMemoryShapedSystemInstruction('You are also an expert writing assistant and creative thinker. Return only the modified text without introductions or conclusions.')
  );
}

export async function generateGoalRoadmap(goalTitle: string, goalDescription: string, regenerationPrompt?: string) {
  const prompt = `I have a goal: "${goalTitle}".
Description: ${goalDescription}
${regenerationPrompt?.trim() ? `\nUser instructions for this roadmap:\n${regenerationPrompt.trim()}\n` : ''}

Please help me achieve this goal by producing valid JSON with exactly these keys:
- knowledge: array of strings
- ideas: array of strings
- todos: array of strings

Keep each item concrete and useful.`;

  const raw = await callGemma(
    prompt,
    buildMemoryShapedSystemInstruction('Focus on strategic planning. Return only valid JSON with keys knowledge, ideas, and todos.')
  );

  try {
    return JSON.parse(extractJsonObject(raw || '{}'));
  } catch (error) {
    throw buildRuntimeError('Gemma returned non-JSON roadmap output.', error instanceof Error ? error.message : String(error));
  }
}

export async function sharpenIdeaArtifact(input: {
  title: string;
  summary: string;
  content: string;
  type: 'Concept' | 'Principle' | 'Reference' | 'Project' | 'Question' | 'Action' | 'Base Skill' | 'Umbrella Goal';
  stage: 'Seed' | 'Sprouting' | 'Evergreen' | 'Archived';
  confidence: number;
  maturity: number;
  nextAction?: string;
  openQuestions?: string[];
  tags?: string[];
}) {
  const prompt = `Sharpen the following HumanBoard knowledge artifact so it becomes clearer, tighter, and more trustworthy.

Artifact:
${JSON.stringify(input, null, 2)}

Return valid JSON with exactly these keys:
- summary: string
- content: string
- confidence: integer from 1 to 10
- maturity: integer from 0 to 100
- nextAction: string
- openQuestions: array of strings
- tags: array of short strings

Rules:
- Preserve the core idea, do not invent fake evidence.
- Reduce vagueness and tighten claims.
- If uncertainty remains, keep or improve the open questions instead of pretending certainty.
- nextAction should be concrete.
- Keep output concise but useful.
- Return JSON only.`;

  const raw = await callGemma(
    prompt,
    buildMemoryShapedSystemInstruction('Sharpen weak knowledge artifacts into clearer, more actionable versions while preserving uncertainty honestly. Return only valid JSON with the requested keys.')
  );

  try {
    return JSON.parse(extractJsonObject(raw || '{}')) as {
      summary: string;
      content: string;
      confidence: number;
      maturity: number;
      nextAction: string;
      openQuestions: string[];
      tags: string[];
    };
  } catch (error) {
    throw buildRuntimeError('Gemma returned non-JSON sharpen output.', error instanceof Error ? error.message : String(error));
  }
}

export async function compileRawNoteToKnowledge(noteContent: string) {
  const prompt = `Turn the following raw note into one HumanBoard typed knowledge artifact.

Raw note:
"""
${noteContent}
"""

Return valid JSON with exactly these keys:
- title: string
- summary: string
- content: string
- type: one of Concept, Principle, Reference, Project, Question, Action
- stage: one of Seed, Sprouting, Evergreen
- confidence: integer from 1 to 10
- maturity: integer from 0 to 100
- nextAction: string
- tags: array of 2 to 6 short strings
- sourceNoteExcerpt: string
- compileReason: string
- openQuestions: array of strings

Rules:
- Keep it concise but useful.
- content should be a cleaned-up compiled knowledge page, not just the raw note.
- sourceNoteExcerpt should quote or restate the most important source fragment in under 220 characters.
- compileReason should briefly explain why this note fits the chosen type.
- openQuestions should be empty only when the note is already very clear and settled.
- If the note reads like a belief/rule, use Principle.
- If it reads like a reusable idea, use Concept.
- If it reads like an observation/source/fact memo, use Reference.
- If it reads like a coordinated effort with an objective and moving parts, use Project.
- If it is best framed as something to investigate, use Question.
- If it is best framed as a concrete next step, use Action.
- Return JSON only.`;

  const raw = await callGemma(
    prompt,
    'You are the HumanBoard Librarian assistant. Convert raw notes into clean typed knowledge artifacts. Classify carefully, preserve useful nuance, and return only valid JSON with the requested keys.'
  );

  try {
    return JSON.parse(extractJsonObject(raw || '{}')) as {
      title: string;
      summary: string;
      content: string;
      type: 'Concept' | 'Principle' | 'Reference' | 'Project' | 'Question' | 'Action';
      stage: 'Seed' | 'Sprouting' | 'Evergreen';
      confidence: number;
      maturity: number;
      nextAction: string;
      tags: string[];
      sourceNoteExcerpt: string;
      compileReason: string;
      openQuestions: string[];
    };
  } catch (error) {
    throw buildRuntimeError('Gemma returned non-JSON compile output.', error instanceof Error ? error.message : String(error));
  }
}

export async function generateReflectionFromCandidate(input: {
  summary: string;
  repeatedTerms: string[];
  noteCount: number;
  ideaCount: number;
  signalScore: number;
}) {
  const prompt = `You are generating one quiet, high-signal reflection for HumanBoard.

Candidate pattern:
${JSON.stringify(input, null, 2)}

Return valid JSON with exactly these keys:
- pattern: string
- question: string
- suggestion: string
- shouldReflect: boolean
- principle: object | null
- tension: object | null

Where principle is:
- title: string
- summary: string
- content: string
- nextAction: string
- openQuestions: array of strings
- tags: array of strings

And tension is:
- title: string
- summary: string
- content: string
- nextAction: string
- openQuestions: array of strings
- tags: array of strings

Rules:
- If the signal is weak, noisy, vague, or not genuinely insightful, set shouldReflect to false.
- When shouldReflect is false, keep pattern/question/suggestion as short empty strings and set principle/tension to null.
- pattern should name the recurring theme plainly.
- question should sharpen thinking, not sound therapeutic.
- suggestion should be one practical next move.
- principle should only be present when a real distilled rule/belief emerges from the pattern.
- tension should only be present when there is a meaningful unresolved tradeoff, contradiction, or recurring friction.
- tension will be stored inside the current schema as a Question-like artifact, so write it as a sharp unresolved tension, not as a solved answer.
- Be concise.
- Return JSON only.`;

  const raw = await callGemma(
    prompt,
    buildMemoryShapedSystemInstruction('Only produce a reflection when there is a real recurring signal. Stay skeptical, practical, and concise. Return only valid JSON.')
  );

  try {
    return JSON.parse(extractJsonObject(raw || '{}')) as {
      pattern: string;
      question: string;
      suggestion: string;
      shouldReflect: boolean;
      principle?: {
        title: string;
        summary: string;
        content: string;
        nextAction?: string;
        openQuestions?: string[];
        tags?: string[];
      } | null;
      tension?: {
        title: string;
        summary: string;
        content: string;
        nextAction?: string;
        openQuestions?: string[];
        tags?: string[];
      } | null;
    };
  } catch (error) {
    throw buildRuntimeError('Gemma returned non-JSON reflection output.', error instanceof Error ? error.message : String(error));
  }
}

// Word-confidence QC over WhisperX output. WhisperX's alignment step attaches a
// per-word `score` (0..1) to each word; low scores are where it likely mis-heard
// speech. This module is pure (no VM/IO) so it's easy to unit-test: it parses the
// JSON sidecar test_qc.py emits, flags low-confidence words, and applies the user's
// corrections back into the real SRT.

/** Default cutoff: words scoring below this are flagged for review. */
export const DEFAULT_THRESHOLD = 0.6;

export type WhisperWord = {
	word: string;
	// Alignment can omit start/end/score for some tokens (e.g. numerals it
	// couldn't align), so treat them as optional.
	start?: number;
	end?: number;
	score?: number;
};

export type WhisperSegment = {
	start?: number;
	end?: number;
	text?: string;
	words: WhisperWord[];
};

export type WhisperDoc = {
	segments: WhisperSegment[];
};

export type FlaggedWord = {
	word: string;
	score: number;
	start?: number;
	end?: number;
	/** Index of the segment this word belongs to, for sentence context. */
	segmentIndex: number;
	/** Index of the word within that segment's `words`. */
	wordIndex: number;
};

export type ConfidenceAnalysis = {
	/** Mean score over words that have a numeric score (0..1), or 0 if none. */
	averageConfidence: number;
	/** How many words contributed to the average. */
	scoredWordCount: number;
	/** Words below the threshold, sorted by start time. */
	flagged: FlaggedWord[];
};

/**
 * Parse the WhisperX JSON sidecar. Accepts the `{segments: [...]}` shape test_qc.py
 * writes. Throws a student-friendly error rather than a raw JSON.parse message.
 */
export function parseWhisperJson(raw: string): WhisperDoc {
	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch {
		throw new Error('Could not parse the word-confidence JSON (invalid JSON).');
	}
	if (
		typeof data !== 'object' ||
		data === null ||
		!Array.isArray((data as {segments?: unknown}).segments)
	) {
		throw new Error('Word-confidence JSON is missing a "segments" array.');
	}
	const segments = (data as {segments: unknown[]}).segments.map(seg => {
		const s = (seg ?? {}) as Record<string, unknown>;
		const words = Array.isArray(s['words'])
			? (s['words'] as unknown[]).map(w => {
					const word = (w ?? {}) as Record<string, unknown>;
					return {
						word: typeof word['word'] === 'string' ? word['word'] : '',
						start: typeof word['start'] === 'number' ? word['start'] : undefined,
						end: typeof word['end'] === 'number' ? word['end'] : undefined,
						score: typeof word['score'] === 'number' ? word['score'] : undefined,
					} satisfies WhisperWord;
			  })
			: [];
		return {
			start: typeof s['start'] === 'number' ? s['start'] : undefined,
			end: typeof s['end'] === 'number' ? s['end'] : undefined,
			text: typeof s['text'] === 'string' ? s['text'] : undefined,
			words,
		} satisfies WhisperSegment;
	});
	return {segments};
}

/**
 * Compute the average confidence and the list of below-threshold words. Words
 * without a numeric score are excluded from both the average and the flagged list.
 */
export function analyzeConfidence(
	doc: WhisperDoc,
	threshold: number = DEFAULT_THRESHOLD,
): ConfidenceAnalysis {
	let total = 0;
	let scoredWordCount = 0;
	const flagged: FlaggedWord[] = [];

	doc.segments.forEach((segment, segmentIndex) => {
		segment.words.forEach((word, wordIndex) => {
			if (typeof word.score !== 'number') return;
			total += word.score;
			scoredWordCount += 1;
			if (word.score < threshold) {
				flagged.push({
					word: word.word,
					score: word.score,
					start: word.start,
					end: word.end,
					segmentIndex,
					wordIndex,
				});
			}
		});
	});

	// Sort flagged words chronologically so review follows the video. Words with no
	// timestamp sort last.
	flagged.sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity));

	return {
		averageConfidence: scoredWordCount === 0 ? 0 : total / scoredWordCount,
		scoredWordCount,
		flagged,
	};
}

/** Format a time offset in seconds as HH:MM:SS for on-screen display. */
export function formatTimestamp(seconds: number | undefined): string {
	if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '—';
	const total = Math.max(0, Math.floor(seconds));
	const hh = Math.floor(total / 3600);
	const mm = Math.floor((total % 3600) / 60);
	const ss = total % 60;
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

export type SrtCorrection = {
	/** Start time (seconds) of the original word, used to find its SRT block. */
	start?: number;
	/** The original (mis-heard) word as transcribed. */
	word: string;
	/** The replacement the user typed. */
	newWord: string;
};

// Parse "HH:MM:SS,mmm" (SRT time) into seconds.
function parseSrtTime(value: string): number | undefined {
	const match = /^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/.exec(value.trim());
	if (!match) return undefined;
	const [, hh, mm, ss, ms] = match;
	return (
		Number(hh) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms) / 1000
	);
}

// Strip leading/trailing punctuation from a WhisperX word token so it matches the
// bare word as it appears in the SRT text (e.g. "world." -> "world").
function bareWord(word: string): string {
	return word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

// Replace the first whole-word occurrence of `target` in `text` with `replacement`,
// preserving surrounding punctuation. Returns null if not found.
function replaceWordInText(
	text: string,
	target: string,
	replacement: string,
): string | null {
	const bare = bareWord(target);
	if (!bare) return null;
	const escaped = bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const re = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u');
	if (!re.test(text)) return null;
	return text.replace(re, replacement);
}

/**
 * Apply word corrections to the real SRT text. For each correction we find the SRT
 * block whose time range contains the word's start time, then replace the original
 * token within that block's text. Anchoring by timestamp keeps edits localized even
 * when the same word appears elsewhere, and rebuilding from the original SRT
 * preserves WhisperX's line splitting/formatting.
 */
export function applyCorrectionsToSrt(
	srtText: string,
	corrections: SrtCorrection[],
): string {
	// Normalize newlines, then split into blocks on blank lines.
	const normalized = srtText.replace(/\r\n/g, '\n');
	const blocks = normalized.split(/\n\s*\n/);

	type Block = {start?: number; end?: number; lines: string[]};
	const parsed: Block[] = blocks.map(block => {
		const lines = block.split('\n');
		let start: number | undefined;
		let end: number | undefined;
		for (const line of lines) {
			const m = /(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/.exec(
				line,
			);
			if (m) {
				start = parseSrtTime(m[1]!);
				end = parseSrtTime(m[2]!);
				break;
			}
		}
		return {start, end, lines};
	});

	for (const correction of corrections) {
		if (correction.newWord === correction.word) continue;
		const at = correction.start;
		// Find the block whose [start,end] contains the word; fall back to the
		// nearest block by start time if no exact containment.
		let target: Block | undefined;
		if (typeof at === 'number') {
			target = parsed.find(
				b =>
					typeof b.start === 'number' &&
					typeof b.end === 'number' &&
					at >= b.start &&
					at <= b.end,
			);
			if (!target) {
				let bestGap = Infinity;
				for (const b of parsed) {
					if (typeof b.start !== 'number') continue;
					const gap = Math.abs(b.start - at);
					if (gap < bestGap) {
						bestGap = gap;
						target = b;
					}
				}
			}
		}
		if (!target) continue;
		// Replace within the text lines of the block (skip the index + timecode lines).
		for (let i = 0; i < target.lines.length; i++) {
			const line = target.lines[i]!;
			if (/-->/.test(line)) continue;
			if (/^\s*\d+\s*$/.test(line)) continue;
			const replaced = replaceWordInText(line, correction.word, correction.newWord);
			if (replaced !== null) {
				target.lines[i] = replaced;
				break;
			}
		}
	}

	return parsed.map(b => b.lines.join('\n')).join('\n\n');
}

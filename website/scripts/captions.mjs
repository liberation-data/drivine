/**
 * The explainer's captions as they are read: `node scripts/captions.mjs <captions.srt|.vtt> public/video/drivine-explainer.vtt`.
 *
 * The video's own captions (captions.srt in liberation-data/drivine-explainer-video) break wherever the narration
 * paused, so a caption can be a line too long, or one word left over from the sentence before. This joins them back
 * into sentences, each from its first caption's start to its last one's end, and splits each sentence again into
 * captions of at most two lines of at most 42 characters, the usual limit for subtitles: at its commas, colons and
 * dashes where it can, and between words where it can't, never leaving a scrap of a few words for the next. Each
 * caption shows for its share of the sentence's characters. Its two lines are broken where they come out most even, at
 * a comma if one is near, and never after a little word such as "the" or "of".
 *
 * The same rules as Embabel Worlds' captions (video/build/captions.mjs in embabel-worlds/worlds-landing).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const LINE = 42;

/* Words that read badly at the end of a line, away from what they lead into. */
const SMALL = new Set(['a', 'an', 'the', 'no', 'to', 'of', 'in', 'on', 'at', 'for', 'and', 'or', 'but', 'your', 'its', 'it', 'is', 'as', 'with', 'from', 'what', 'where', 'which', 'who', 'one']);

/** The words of `text` in the fewest captions of at most two lines, each caption's lines broken most evenly. */
export function split(text) {
    const words = text.split(/\s+/).filter(Boolean);
    /* Where a caption may end, best first: after a clause's punctuation, else between any two words. */
    const clause = (word) => /[,;:]["')]*$|^[—–-]$/.test(word);
    const pages = [];
    let from = 0;
    while (from < words.length) {
        /* Every end that fits in two lines; the last is the fullest caption. */
        const fits = [];
        for (let to = from + 1; to <= words.length; to++) {
            const lines = twoLines(words.slice(from, to));
            if (!lines) break;
            fits.push({ to, lines });
        }
        if (!fits.length) fits.push({ to: from + 1, lines: [words[from]] });
        const fullest = fits.at(-1);
        const length = (fit) => fit.lines.join(' ').length;
        const rest = (fit) => words.slice(fit.to).join(' ').length;
        /* The rest of the sentence if it fits. Else the last clause that fills more than a line (or any last clause, if
           the fullest caption would leave a scrap of a few words), as long as it leaves no scrap itself. Else, if the
           fullest would leave a scrap, the end where the caption and the rest come out most even. Else the fullest. */
        const scrap = rest(fullest) < LINE / 2;
        const atClause = fits.findLast((fit) => clause(words[fit.to - 1]) && (length(fit) > LINE || scrap) && rest(fit) >= LINE / 2);
        const even = scrap
            ? fits.filter((fit) => twoLines(words.slice(fit.to))).reduce((best, fit) => (Math.abs(length(fit) - rest(fit)) < Math.abs(length(best) - rest(best)) ? fit : best), fullest)
            : fullest;
        const chosen = fullest.to === words.length ? fullest : (atClause ?? even);
        pages.push(chosen.lines.join('\n'));
        from = chosen.to;
    }
    return pages;
}

/** The words as one line, or two broken most evenly, each at most LINE long; null if they don't fit in two. */
function twoLines(words) {
    const whole = words.join(' ');
    if (whole.length <= LINE) return [whole];
    let best = null;
    for (let k = 1; k < words.length; k++) {
        const a = words.slice(0, k).join(' ');
        const b = words.slice(k).join(' ');
        if (a.length > LINE || b.length > LINE) continue;
        /* As even as can be, but a comma is a better place to break, and a little word ends no line. */
        const spread = Math.abs(a.length - b.length) + (/,["')]*$/.test(a) ? -12 : 0) + (SMALL.has(words[k - 1].toLowerCase()) ? 12 : 0);
        if (!best || spread < best.spread) best = { lines: [a, b], spread };
    }
    return best?.lines ?? null;
}

/** `[from, to, text]` cues joined into sentences, each from its first cue's start to its last one's end. */
export function sentences(cues) {
    const joined = [];
    let open = null;
    for (const [from, to, text] of cues) {
        open = open ? [open[0], to, `${open[2]} ${text}`] : [from, to, text];
        if (/[.!?]["')]*$/.test(text.trim())) {
            joined.push(open);
            open = null;
        }
    }
    if (open) joined.push(open);
    return joined;
}

/** `[from, to, text]` cues, each split by `split` and its time shared out by the characters of each piece. */
export function paced(cues) {
    return cues.flatMap(([from, to, text]) => {
        const pages = split(text);
        const total = pages.reduce((n, page) => n + page.length, 0);
        let t = from;
        return pages.map((page) => {
            const d = ((to - from) * page.length) / total;
            const cue = [t, t + d, page];
            t += d;
            return cue;
        });
    });
}

const stamp = (s) => new Date(Math.max(0, s) * 1000).toISOString().slice(11, 23);
/* SRT writes a time's milliseconds after a comma, WebVTT after a full stop; a WebVTT time may leave out the hours. */
const seconds = (time) => time.replace(',', '.').split(':').reduce((n, part) => n * 60 + Number(part), 0);

/** `[from, to, text]` cues as WebVTT. */
export function vtt(cues) {
    return `WEBVTT\n\n${cues.map(([from, to, text]) => `${stamp(from)} --> ${stamp(to)}\n${text}`).join('\n\n')}\n`;
}

/** An SRT or WebVTT file's cues as `[from, to, text]`, a cue's lines joined by spaces. */
export function read(file) {
    return file.replace(/^﻿?WEBVTT[^\n]*\n/, '').trim().split(/\r?\n\r?\n/).map((block) => {
        const lines = block.split(/\r?\n/);
        const at = lines.findIndex((line) => line.includes('-->'));
        const [from, to] = lines[at].split('-->').map((it) => seconds(it.trim().split(/\s/)[0]));
        return [from, to, lines.slice(at + 1).join(' ')];
    });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const [input, output] = process.argv.slice(2);
    if (!input || !output) throw new Error('usage: node scripts/captions.mjs <captions.srt|.vtt> <out.vtt>');
    writeFileSync(output, vtt(paced(sentences(read(readFileSync(input, 'utf8'))))));
}

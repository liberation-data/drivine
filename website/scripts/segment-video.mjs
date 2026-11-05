/**
 * Cuts the landing page's explainer, public/video/drivine-explainer.mp4, into HLS segments in public/video/hls/ (a
 * playlist, index.m3u8, and pieces of one or two megabytes, one to each of its keyframes, 8.3 seconds apart), with ffmpeg,
 * copied rather than re-encoded, in a fraction of a second. Runs before `dev` and `build`, and again only when the video
 * is newer than its segments. Whether there are segments goes to src/generated/video.json, for the page.
 *
 * Why: GitHub Pages' CDN fetches a whole file from its origin before it sends a byte of it, and keeps it only ten
 * minutes (max-age=600), so a visitor who pressed Watch at a cold edge waited for all 39 MB to cross; for a segment it
 * waits for one or two megabytes. Without ffmpeg (`brew install ffmpeg`) the page plays the mp4 itself, with a warning.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = dirname(dirname(fileURLToPath(import.meta.url)));
const video = join(site, 'public', 'video', 'drivine-explainer.mp4');
const hls = join(site, 'public', 'video', 'hls');
const playlist = join(hls, 'index.m3u8');

function segment() {
    if (existsSync(playlist) && statSync(playlist).mtimeMs >= statSync(video).mtimeMs) return true;
    /* Made in a folder of its own, then moved, so a half-made one is never kept. */
    const part = `${hls}.part`;
    rmSync(part, { recursive: true, force: true });
    mkdirSync(part, { recursive: true });
    try {
        execFileSync('ffmpeg', ['-v', 'error', '-i', video, '-c', 'copy', '-f', 'hls', '-hls_time', '4', '-hls_playlist_type', 'vod', '-hls_segment_type', 'fmp4', '-hls_fmp4_init_filename', 'init.mp4', '-hls_segment_filename', join(part, '%03d.m4s'), join(part, 'index.m3u8')], { stdio: ['ignore', 'ignore', 'inherit'] });
    } catch (error) {
        rmSync(part, { recursive: true, force: true });
        console.warn(`The video plays from its mp4, as it couldn't be cut into segments (${error.code === 'ENOENT' ? 'no ffmpeg: brew install ffmpeg' : error.message.split('\n')[0]})`);
        return false;
    }
    rmSync(hls, { recursive: true, force: true });
    renameSync(part, hls);
    return true;
}

const made = segment();
mkdirSync(join(site, 'src', 'generated'), { recursive: true });
writeFileSync(join(site, 'src', 'generated', 'video.json'), `${JSON.stringify({ hls: made })}\n`);

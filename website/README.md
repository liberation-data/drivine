# The Drivine website

The site at [drivine.org](https://drivine.org/), built with
[Starlight](https://starlight.astro.build) and published by `.github/workflows/website.yml`.

- `src/pages/index.astro`: the landing page.
- `public/video/`: the landing page's explainer. The page plays it in YouTube's embed while `PLAY_ON_YOUTUBE` in
  `src/pages/index.astro` is true, and from these files when it's false (YouTube served it at 240p in some browsers for
  its first weeks; it plays 1080p now). They're built and served either way. `drivine-explainer.mp4` is re-encoded from
  the master in the private `liberation-data/drivine-explainer-video` repository
  (`video/final/drivine-graph-rag-master.mp4`): H.264 1080p30 with AAC sound, its index at the front (`-movflags +faststart`) so it starts before it has all downloaded, and well under
  GitHub Pages' 100 MB a file. The page plays it from HLS segments, `public/video/hls/`, which the build cuts from it
  with ffmpeg (`scripts/segment-video.mjs`; `brew install ffmpeg`, or it plays the mp4), so a cold CDN edge fetches a
  megabyte or two from the origin before the first frame, not all 39 MB. `drivine-explainer.vtt` is that repository's
  `video/final/captions.srt`, rejoined into sentences and split again into captions of two lines of 42 characters at most:
  `node scripts/captions.mjs <captions.srt> public/video/drivine-explainer.vtt`. When the video ends, which it does by
  fading to black, the page shows its end card, `src/assets/video-end.jpg` (the frame at 4:25), with a Watch again
  button. A new cut replaces all three (the end card with
  `ffmpeg -ss <a second before the end> -i <the video> -frames:v 1 -q:v 4 src/assets/video-end.jpg`), and the length
  on the page: `4:26` in the hero's tip and on the play button, and in words in the button's `aria-label` and the line
  under the player.
- `public/og-card.jpg`: the card a shared link to the site shows (the landing page's and every docs page's
  `og:image`), the video's poster `src/assets/video-poster.jpg` cropped to 1200x630. A new poster replaces it too.
- `public/favicon.svg`: the tab icon on every page, `src/assets/cow-black.png` embedded as a data URI and inverted to
  white when the browser's theme is dark. Safari doesn't take SVG tab icons and shows `public/favicon.ico`, linked
  beside it with `sizes="32x32"` so other browsers still pick the SVG. A new cow replaces both:
  `printf '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><style>@media (prefers-color-scheme:dark){image{filter:invert(1)}}</style><image width="96" height="96" href="data:image/png;base64,%s"/></svg>\n' "$(base64 -i src/assets/cow-black.png)" > public/favicon.svg`.
- `src/components/Share.astro`: the Share buttons under the video, on its end card, in the footer, and beside each docs
  page's title (`src/components/PageTitle.astro`).
- The docs are generated, not written here: `scripts/import-readmes.mjs` turns this repository's `docs/` into the
  TypeScript docs (`/ts/`), drivine-python's into the Python docs (`/py/`) and drivine4j's into the Kotlin & Java docs
  (`/jvm/`). Each library's `docs/` holds its guide a file to each `##` section, after `00-introduction.md`; a library
  with no `docs/` guide yet has its README read instead. Each `##` section is a page, and a long one a group of pages,
  one to each `###`. Change the docs by changing the libraries' `docs/`.
- `src/pages/[...slug].md.ts`: each docs page's markdown beside it, `/jvm/testing/` also as `/jvm/testing.md`: the title
  as its `#` heading and the body, without the sidebar, header or footer, each heading with its id on the page
  (`## Testing {#testing}`). Embabel Guide's search reads the Kotlin & Java docs this way, finding the pages from the
  sitemap and linking each result to its page and heading.

```bash
npm install
npm run dev        # imports the docs, then serves the site at localhost:4321
npm run build      # the same, into dist/
```

`npm run build` fetches drivine-python's and drivine4j's docs from GitHub, listing `docs/` through the contents API
(with `GITHUB_TOKEN`, if set) and fetching each file raw, or their READMEs where they have no `docs/` guide.
`DRIVINE_PYTHON_DOCS=<dir>` and `DRIVINE4J_DOCS=<dir>` read local `docs/` folders instead, and
`DRIVINE_PYTHON_README=<path>` and `DRIVINE4J_README=<path>` local READMEs.

The landing page's star counts, and the newest released train named under its installs (which also pins the hero's
three install commands and the Gradle line to the train's versions), are fetched from GitHub's API when the site is
built, with `GITHUB_TOKEN` if set: the train from liberation-data/drivine-release's `trains/<train>.json`, the newest
whose `released` is set. What can't be fetched is left out: the train's name goes, the installs are left unpinned, and
the Gradle line keeps `<version>`.

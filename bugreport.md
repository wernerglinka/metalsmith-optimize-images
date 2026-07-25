# Bug report: responsive markup is never emitted for statik-copied images

Filed 2026-07-24 from work on the structured-content starter. Everything below
was observed on Werner's machine; the numbers are reproducible with the
commands given.

## Summary

When a site's images are copied to the build outside the Metalsmith file tree
(`metalsmith.statik(['assets'])`, with images under `src/assets/`), this plugin
cannot resolve a single one of them. Every lookup logs `Image not found`, no
`<img>` is ever rewritten, and the site ships original full-size images while
the build directory fills with variants nothing references.

The failure is silent. The build succeeds, the plugin reports nothing on
stdout, and the only symptom is markup that was never touched.

Worse, the outcome depends on what is already in `build/`. A build over a
previous build's output partially works, because the images the plugin could
not find in the file tree happen to exist on disk from last time. So a
developer's incremental build produces responsive markup and CI's clean build
does not, from identical sources.

## Affected and unaffected configurations

| Project | Plugin | Images live in | Copy mechanism | `cache` | Result |
|---|---|---|---|---|---|
| metalsmith2025-structured-content-starter | 0.12.0 | `src/assets/images/` | `metalsmith.statik(['assets'])` | unset | **broken**: 0 pages rewritten |
| wernerglinka.com | 1.0.0 | `lib/assets/images/` | `metalsmith-static-files` | `true` | works: 104 pages rewritten |

The working case is the contrast worth studying: it works because `cacheDir`
resolves to `lib/assets/images/responsive`, which ends with `outputDir`
(`assets/images/responsive`), so `sourcePrefix` derives to `lib/` and the
plugin can find sources on disk before the static copy runs. See the
`sourcePrefix` derivation near the top of `createPlugin` in `src/index.js`.

The starter satisfies neither path. Its images are not in the file tree
(statik copies them at build finalization, after every plugin), and its source
prefix is `src/`, which the cache-based derivation never produces.

## Reproduction

Clean build, starter, production:

```shell
cd metalsmith2025-structured-content-starter
rm -rf build
DEBUG='*optimize-images*' npm run build
```

Observed, for every image on every page:

```
metalsmith-optimize-images Processing HTML file: blog/index.html
metalsmith-optimize-images Found 5 images in blog/index.html
metalsmith-optimize-images Image not found: assets/images/sample7.jpg
metalsmith-optimize-images Image not found: assets/images/sample6.jpg
```

Result: 0 of the 13 built pages contain a `srcset`; 120 files sit in
`build/assets/images/responsive/`, all of them from the `processUnusedImages`
path (unhashed `name-320w.avif` naming, intended for CSS `image-set()`), none
referenced by any page.

The same build over a populated `build/` directory yields 188 files including
hashed `name-320w-<hash>.avif` variants, and the pages do get rewritten. That
is the state-dependence: same sources, same command, different output.

## What was ruled out

- **Not the two naming schemes.** Hashed names come from the HTML-driven path,
  unhashed from `processUnusedImages`. Both are intended behavior; only the
  first is missing here.
- **Not fixed by enabling the cache.** Adding `cache: true` to the starter and
  building cold produced a third outcome: 56 files, still 0 rewritten pages,
  and a stray `lib/assets/images/responsive/` directory created in a project
  whose images live in `src/assets`. The cache path derivation assumes a
  `lib/assets` layout.
- **Not a regression between versions.** 0.12.0 and 1.0.0 both behave this
  way; the difference between the two projects is layout and copy mechanism,
  not plugin version.

## Root cause, as far as it was traced

`processHtmlFile` resolves each `<img src>` against the Metalsmith `files`
object and, failing that, against disk using `sourcePrefix`. With statik, the
image is in neither place at plugin time: statik copies happen at build
finalization, and `sourcePrefix` is only derived when a cache directory
happens to end with `outputDir`. The lookup fails, `Image not found` is
logged at debug level, and the image is skipped without touching the markup.

## Suggested directions

Not prescriptive; whoever picks this up should decide.

1. **Resolve against the Metalsmith source directory.** The plugin knows
   `metalsmith.source()`; an image referenced as `/assets/images/x.jpg` in a
   statik-copied site is at `<source>/assets/images/x.jpg`. This looks like the
   general fix, and would make `sourcePrefix` a special case of it rather than
   the only path.
2. **Do not infer the source prefix from the cache directory.** Two unrelated
   concerns are coupled today: where variants are cached, and where sources are
   found. A site that wants one should not have to configure the other.
3. **Fail loudly.** A run where every single image lookup failed is not a
   normal run. A warning on stdout when the miss rate is total would have made
   this visible immediately instead of after a build-output diff.

## Second, smaller bug: wrong intrinsic height on a cold cache

Found while verifying the fix below. The same build run against an empty
cache and against a populated one produces different `height` attributes,
and the cold one is wrong.

`src/assets/images/sample3.jpg` is 354x417. Emitted markup:

```html
<!-- first build, empty cache -->
<img src="/assets/images/sample3.jpg" width="320" height="417">
<!-- every build after, cache populated -->
<img src="/assets/images/sample3.jpg" width="320" height="377">
```

320 / 354 * 417 = 377, so the warm value is correct and the cold value keeps
the source height while scaling the width. The consequence is that the first
build after a cache wipe, which is what CI and a fresh clone do, ships images
with a distorted aspect ratio and the layout shift that comes with it.

The likely cause is that the cold path reads dimensions from the source image
and the warm path from the generated variant, and only the second one accounts
for the resize.

## Verification for a fix

- Starter, clean `rm -rf build && npm run build`: pages must contain `srcset`
  pointing at hashed variants.
- Same build run twice, once over an empty `build/` and once over a populated
  one: output must be identical. This is the invariant that is broken today.
- Same build run against an empty cache and a populated one: the `width` and
  `height` attributes must match, and must reflect the source aspect ratio.
- wernerglinka.com must keep working: 104 pages rewritten, cache reused from
  `lib/assets/images/responsive` rather than regenerated.

# metalsmith-optimize-images - Development Context

This file gives Claude operational context for working in this plugin. Plugin
behavior is documented in [README.md](README.md) and the architecture
rationale in [docs/THEORY.md](docs/THEORY.md) — don't duplicate them here.

## Project Overview

Generates responsive image variants (AVIF/WebP with JPEG/PNG fallback, multiple
widths) with Sharp and rewrites `<img>` tags into `<picture>` elements (or
progressive-loading wrappers). Also processes unused images for CSS
`image-set()` backgrounds, and can persist variants to a committed source-tree
cache so repeat/CI builds skip Sharp. Code is split into `src/processors/`
(image, html, progressive) and `src/utils/` (config, hash, paths).

ESM-only Metalsmith plugin, published directly from `src/` (no build step),
targeting Node.js 22+. CommonJS consumers can still `require()` it via
Node 22's stable `require(esm)` support.

Runtime dependencies (keep them): `sharp` (image processing), `cheerio` (HTML
parsing), `mkdirp` (output directories).

## MCP Server Integration (CRITICAL)

**IMPORTANT**: This plugin was created with `metalsmith-plugin-mcp-server`.
When working on this plugin, AI assistants (Claude) MUST use the MCP server
tools rather than improvising equivalents.

### Essential MCP Commands

```bash
list-templates                          # See what's available
get-template plugin/CLAUDE.md           # Retrieve exact template content
get-template configs/biome.json
get-template configs/release-it.json
validate .                              # Plugin validation + recommendations
diff-template .                         # Drift check vs current scaffold
configs .                               # Generate config files
update-deps .                           # Dependency update
```

### CRITICAL RULES for AI Assistants

1. **Use MCP server templates verbatim** — never paraphrase or "simplify"
2. **Run `list-templates` before guessing** at template names
3. **When `validate` produces a recommendation, copy it exactly** — including
   the exact command suggested
4. **Ask the user** before modifying `.release-it.json`, `package.json`,
   `biome.json`, or any other `.json` / `.yml` / `.config.js` file
5. **Never set `npm.publish` to `true`** in `.release-it.json` — releases
   here are deliberately manual

## Plugin Development Rules

### Use Metalsmith's native methods

Prefer the methods Metalsmith provides on the instance over external
packages:

```javascript
// ❌                                    // ✅
require('debug')('')                     metalsmith.debug('')
require('minimatch')(file, pattern)      metalsmith.match(pattern, file)
process.env.NODE_ENV                     metalsmith.env('NODE_ENV')
path.join(dir, file)                     metalsmith.path(file)
```

### Never mock Metalsmith in tests

This plugin has a strict real-instances policy: tests use real `Metalsmith`
instances and real Sharp/filesystem operations, never mocks, so they catch
integration breaks. Mocking `metalsmith()`, `metalsmith.match`,
`metalsmith.debug`, `metalsmith.env`, `metalsmith.path`, or plugin invocation
has repeatedly hidden bugs that only surface in production. A couple of tests
use narrow injection seams (a `destination()` stub for a build path, a debug
capture to assert the namespace string) — those are not full-Metalsmith mocks.

Mocking unrelated systems (network) is fine; do NOT mock Sharp or fs here.

### Metalsmith goes in devDependencies, never peerDependencies

The plugin code never imports Metalsmith — it receives the instance as a
parameter. Tests import Metalsmith directly. Users have their own install.

## Testing notes

- Runner: `node --test`, native coverage. Real image processing is slow, so the
  test timeout is **60s** (`--test-timeout=60000`), higher than the ecosystem
  default of 15s. If a test file times out, that is usually genuine Sharp
  slowness, not a hang.
- Tests write to real working dirs (`test/build`, `test/temp-no-html`,
  `test/unit/temp-build`). Those dirs are excluded from Biome in `biome.json`
  so lint never reformats generated files.
- `src/utils/config.js`'s `deepMerge` is a plain loop, not a spread-into-reduce
  accumulator (Biome's `noAccumulatingSpread`). Keep it that way.

## Pre-commit workflow

```bash
npm run lint       # Biome: lint + format with autofix
npm run format     # Format only
npm test           # node:test runner against src/
```

If any step fails, fix the underlying issue and re-run.

## Release commands

```bash
npm run release:patch   # Bug fix
npm run release:minor   # New feature, backwards-compatible
npm run release:major   # Breaking change
```

This plugin is at 1.0+, so standard semver applies: breaking changes are major
releases. Releases use `./scripts/release.sh` (GitHub token via
`gh auth token`); npm publishing is intentionally manual.

## Before releasing: re-read the user-facing docs

Before any `npm run release:*`, read [README.md](README.md) and
[docs/THEORY.md](docs/THEORY.md) end-to-end and fix anything that has drifted
from `src/` — option names/defaults, the cache pipeline-ordering guidance, and
the token list for `outputPattern`. If a release has no user-visible surface,
say so rather than inventing drift.

## File organization

```
/
├── src/
│   ├── index.js              # Orchestration, parallelism, background phase
│   ├── processors/           # imageProcessor, htmlProcessor, progressiveProcessor
│   └── utils/                # config, hash, paths
├── test/
│   ├── index.test.js         # integration against src/
│   ├── integration/          # realistic-workflow
│   ├── unit/                 # utils + processors + edge cases
│   └── fixtures/             # sample images/HTML
├── docs/
│   └── THEORY.md             # Architecture + invariants
└── .github/
    ├── workflows/            # test.yml, test-matrix.yml, claude-code.yml
    └── dependabot.yml
```

## Tooling

- **Biome** for lint + format (single tool, single config: `biome.json`)
- **node:test** + `node:assert/strict` for testing; native coverage
- **Node >= 22** required

## When validation flags something

`validate` returns `failed` (must-fix), `warnings`, and `recommendations`.
Implement recommendations as written. Note two known-benign warnings here: the
"should accept (files, metalsmith, done)" note is a false positive for this
plugin's signature, and "Hardcoded CSS dimensions" refers to the progressive
placeholder styles.

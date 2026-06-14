# /pre-pr — Pre-PR diff-aware verification

Run this skill before opening any pull request. Read the diff, identify what needs to be verified, run targeted checks, then open the PR with pre-validated test steps.

## Steps

### 1. Read the diff

```bash
git diff main...HEAD --stat
git diff main...HEAD
```

Understand what changed across every file in the branch. Group by surface:
- `src/lookup.js` → prompt logic / JSON contract
- `src/server.js`, `src/anki.js`, `src/bunpro.js` → server routes
- `public/js/*.js` → frontend modules
- `public/index.html` → HTML structure / CSS

### 2. Run smoke tests first

```bash
npm run test:smoke
```

**These must pass before writing any ✅ in the PR.** If they fail, fix the issue and do not proceed with PR creation.

### 3. Identify targeted checks

For each changed surface beyond the smoke-test coverage:

| Changed | What to verify |
|---|---|
| `src/lookup.js` | Run `npm run eval:check`; verify JSON contract and ruby on kanji |
| New server route | Hit it with curl or a fetch test; check happy path + missing-field 400 |
| New frontend feature | Playwright: exercise the feature end-to-end, plus one edge case |
| CSS/layout | Playwright: screenshot or computed-style check on affected element |
| Anki card template | Requires Anki desktop — mark ⚠️ with reason |
| BunPro routes | Requires BUNPRO_TOKEN — mark ⚠️ with reason |

### 4. Run the targeted checks

Write and run a short inline Playwright script (or extend the smoke test script) for anything not covered by step 2. Capture actual terminal output as evidence for each check.

### 5. Open the PR

Include in the PR body's **Test plan** section:
- ✅ `<what you did>` → `<what you observed>` — only for steps you actually ran and passed
- ⚠️ `<step>` — `<honest reason not run, e.g. requires Anki desktop>`

Never write ✅ for a step you did not run. Never write ✅ and then describe checking code instead of running the app.

## Rules

- Smoke test failure = stop. Fix before opening PR.
- ⚠️ is correct and honest for things requiring external services (Anki, BunPro, live Claude API calls).
- Targeted checks must exercise the feature at the UI or API surface — reading the code is not verification.

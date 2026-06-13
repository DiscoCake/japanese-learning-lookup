---
description: Push the current branch to GitHub with a conventional commit
---

# Push to GitHub

Stage the relevant source files, write a commit message summarising what changed
(infer from `git diff` and `git status`), commit, and push to origin.

## Steps

1. Run `git status` and `git diff` in parallel to understand what changed.
2. Run `git log --oneline -5` to match the existing commit message style.
3. Stage only project files — never `.env`, `node_modules/`, or `archive/`:
   ```bash
   git add src/ public/index.html CLAUDE.md README.md .env.example plans/ archive/
   ```
   Add any other changed files individually if relevant.
4. Write a concise commit message (one sentence, imperative mood). Append the trailer:
   ```
   Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
   ```
5. Commit, then push to origin.
6. Report the commit hash and push output.

## Safety rules

- Never stage `.env` or any file containing secrets.
- Never force-push. If the push is rejected, report it and stop.
- If there are no staged changes after step 3, report "nothing to commit" and stop.

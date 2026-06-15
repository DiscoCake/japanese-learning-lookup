# /new-branch — Start a fresh branch after PR merge

Use after a PR has been approved and merged into main. Pulls latest main and
creates a new working branch. Optionally accepts a branch name: `/new-branch phase-4`.
Defaults to `dev` if no name is given.

## Steps

1. **Check for uncommitted work**
   ```bash
   git status
   ```
   If there are uncommitted changes, stop and ask the user what to do with them
   before switching branches.

2. **Pull latest main**
   ```bash
   git checkout main
   git pull origin main
   ```
   Confirm the merge commit is present (`git log --oneline -3`).

3. **Create and push the new branch**
   Use the name from the skill argument if provided; otherwise default to `dev`.
   ```bash
   git checkout -b <branch-name>
   git push -u origin <branch-name>
   ```

4. **Clean up the archive**
   Delete all files in `archive/` — they're snapshots from the branch that just merged,
   and git history makes them redundant from this point on.
   ```bash
   rm archive/* 2>/dev/null; echo "archive/ cleared"
   ```

5. **Confirm**
   Show the current branch and the tip commit so the user can see they're starting
   clean from the merged state.

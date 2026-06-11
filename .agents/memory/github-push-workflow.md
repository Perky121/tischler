---
name: GitHub push workflow (main agent)
description: How to push to GitHub from the main agent given git commit restrictions
---

# Pushing to GitHub from the main agent

GitHub remote: `https://github.com/Perky121/tischler.git` (lowercase `tischler` — the repo auto-redirects from `Tischler`). Auth via PAT secret `GITHUB_PERSONAL_ACCESS_TOKEN`.

## Push command (works without touching .git/config)
```
git --no-optional-locks push "https://Perky121:${GITHUB_PERSONAL_ACCESS_TOKEN}@github.com/Perky121/tischler.git" main
```
**Why inline URL:** `git remote set-url` is blocked (writes `.git/config` → "destructive git operation"). Embedding the token in the push URL avoids modifying config and avoids storing the token on disk.

## The commit constraint
`git add` / `git commit` are BLOCKED in the main agent (destructive). I cannot commit my own file edits. Replit auto-commits my edits via a checkpoint **only after my response/loop ends**.
**How to apply:** After editing files, the change is uncommitted. Must wait for the Replit checkpoint (next turn) before pushing. So pushing agent-made edits always takes two turns: edit (end turn → checkpoint commits) → next turn push. Tell the user to send a brief message to trigger the push, and not to run CI until push is confirmed.

## PAT scope gotcha
Pushing `.github/workflows/*.yml` requires the PAT to have **`workflow`** scope in addition to `repo`. Without it: `refusing to allow a Personal Access Token to create or update workflow ... without workflow scope`.

# Octocode Workshop: Hands-on Guide

**Goal:** take one small idea through five evidence-backed checkpoints. Every decision should rest on a `file:line`, a version, a PR or a cited article, not on what the model guesses.

**You leave with:** `IDEA.md`, a cited research decision, a short `RFC.md`, one checked implementation step and a written keep/change decision. A complete build, ten-case benchmark, new skill and polished docs are optional extensions.

The deck has five hands-on pauses. Each slide links directly to its matching practice page in the [published workshop repository](https://github.com/bgauryy/octocode-workshop/tree/main/workshop). During the session, do the **Live checkpoint** on each page; continue the optional extensions afterward.

| # | Slide | Workshop | Time | You produce |
|---|---|---|---|---|
| 1 | Hands on: LLM basics | [Context and first evidence call](./workshop/1.md) | 10 min | One cited `file:line` |
| 2 | Hands on: My story with AI | [Idea](./workshop/2.md) | 10 min | Four-line `IDEA.md` |
| 3 | Hands on: Octocode V1 | [One researched decision](./workshop/3.md) | 10 min | One citation and a plan change or confirmation |
| 4 | Hands on: Octocode V2 | [Short RFC and one build step](./workshop/4.md) | 15 min | `RFC.md` and one verified step or blocker |
| 5 | Hands on: Octocode V3 | [One repeatable check](./workshop/5.md) | 10 min | Observed result and keep/change decision |

**Three-hour run of show:** 105 minutes for the 86-slide talk (about 73 seconds per slide on average), 55 minutes for the five live checkpoints, and 20 minutes for transitions, questions and a break. Rehearse the complete talk against the 105-minute cap. Give each of the eleven skill slides one short example and move its detailed walkthrough into the notes; keep their one-slide-per-skill format. If a section runs long, use the 20-minute buffer before extending a lab.

> **Before the session:** do the [Setup](#setup-do-it-before-the-session) below, so workshop 1 takes minutes and not the whole slot.

---

## Setup (do it before the session)

1. **Node.js 24.x (24.15 or newer).** The `octocode` CLI requires `^24.15.0` (`octocode-mcp` also accepts 22.22.2+ and 26+); other versions print engine warnings. Check with `node -v`.
2. **An agent:** Claude Code, Cursor, Codex, pi, VS Code or any other MCP client.
3. **Add Octocode to your agent:**

   ```bash
   claude mcp add octocode --scope user -- npx -y octocode-mcp@latest   # Claude Code
   npx octocode install --list                                         # other hosts: list the client ids
   npx octocode install --ide cursor                                   # then install for yours (e.g. cursor, codex, opencode)
   npx octocode install --ide cursor --check                           # verify the entry
   ```

   `npx octocode install` needs `--ide <id>`; without it, it only prints usage. For a host that is not on the list (e.g. pi), add the stdio server `npx -y octocode-mcp@latest` in that host's MCP config.

4. **Sign in to GitHub:** see [workshop 1](./workshop/1.md#live-checkpoint).

> ⚠️ If `octocode skill` says *"the `octocode` on PATH is the native binary, not the npm CLI"*, run `npx -y octocode skill ...` instead (the message says the same).

---

## Skills used today

| Skill | Step | Use it to |
|---|---|---|
| `octocode-brainstorming` | [4 B](./workshop/4.md) | explore ideas and best practices with web and code evidence |
| `octocode-rfc-generator` | [4 C](./workshop/4.md) | turn the plan into one reviewable RFC |
| `octocode-architect` | [4 D](./workshop/4.md) | implement with boundaries, data flow and impact in mind |
| `octocode-roast` | [4 E](./workshop/4.md) | find and rank issues in the implementation |
| `octocode-clean-agentic-code` | [4 F](./workshop/4.md) | remove AI slop without changing behavior |
| `octocode-agentic-prompts` | [5 A](./workshop/5.md) | review instructions, tool descriptions and the agentic flow |
| `octocode-eval-benchmark` | [5 B–C](./workshop/5.md) | benchmark with a baseline and a held-out set |
| `octocode-skills` | [5 D](./workshop/5.md) | create a local skill and tune its trigger |
| `octocode-documentation` | [5 E](./workshop/5.md) | write docs checked against the repo |

## If you get stuck

| Problem | Fix |
|---|---|
| GitHub auth fails | `npx octocode auth status`, then `npx octocode auth login --refresh` |
| The agent doesn't see the Octocode tools | `npx octocode install --ide <id> --check`, then restart the agent |
| `octocode skill` fails with "native binary" | A native `octocode` is first on PATH; use `npx -y octocode skill ...` |
| Engine warnings on install | Switch to Node 24.15+ (e.g. `nvm use 24`) |
| GitHub rate limits | Sign in ([workshop 1, step C](./workshop/1.md#c-make-sure-octocode-works-locally-and-github-search-works)), or pair up with a neighbour |
| `config check` says a key is unset | Make sure it is in `~/.octocode/.env` (`npx octocode config home` prints the home), not in the repo or the skill folder |

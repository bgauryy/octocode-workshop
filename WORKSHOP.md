# Octocode workshop: hands-on guide

Take one small idea through five checkpoints. Back each decision with evidence (a `file:line`, a version, a PR, or a cited article), not a model guess.

Each hands-on slide links to its practice page. Do the **Checkpoint** live; the **Go further** sections are for after the session.

| # | Slide | Practice | Time | You produce |
|---|---|---|---|---|
| 1 | LLM basics | [Context and first citation](./workshop/1.md) | 10 min | One cited `file:line` |
| 2 | My story with AI | [Idea](./workshop/2.md) | 10 min | A four-line `IDEA.md` |
| 3 | Octocode V1 | [One researched decision](./workshop/3.md) | 10 min | A citation that changes or confirms the plan |
| 4 | Octocode V2 | [Short RFC and one build step](./workshop/4.md) | 15 min | `RFC.md` and one checked step |
| 5 | Octocode V3 | [One repeatable check](./workshop/5.md) | 10 min | A keep/change decision |

The slides live in [`octocode-workshop/`](./octocode-workshop/). Serve that folder (for example, `npx serve octocode-workshop`) and open the page; `index.html` loads the slide order from `octodeck.json` with `fetch()`, so opening the file directly does not work.

## Setup (before the session)

1. **Node.js 24.15 or newer.** The `octocode` CLI requires `^24.15.0`. Check with `node -v`.
2. **An MCP client:** Claude Code, Cursor, Codex, pi, VS Code, or similar.
3. **Add Octocode to your agent:**

   ```bash
   claude mcp add octocode --scope user -- npx -y octocode-mcp@latest   # Claude Code
   npx octocode install --list                 # other hosts: list client ids
   npx octocode install --ide cursor           # install for your client id
   npx octocode install --ide cursor --check   # verify
   ```

   For a host that is not listed (for example, pi), add the stdio server `npx -y octocode-mcp@latest` to its MCP config.
4. **Sign in to GitHub:** see [practice 1](./workshop/1.md#checkpoint).

## Skills used

| Skill | Practice | Use it to |
|---|---|---|
| `octocode-brainstorming` | [4](./workshop/4.md#go-further) | explore ideas with web and code evidence |
| `octocode-rfc-generator` | [4](./workshop/4.md#go-further) | turn the plan into one reviewable RFC |
| `octocode-architect` | [4](./workshop/4.md#go-further) | check boundaries, data flow, and change impact |
| `octocode-roast` | [4](./workshop/4.md#go-further) | rank issues in the implementation |
| `octocode-clean-agentic-code` | [4](./workshop/4.md#go-further) | remove AI slop without changing behavior |
| `octocode-agentic-prompts` | [5](./workshop/5.md#go-further) | review instructions and tool descriptions |
| `octocode-eval-benchmark` | [5](./workshop/5.md#go-further) | benchmark with a baseline and a held-out set |
| `octocode-skills` | [5](./workshop/5.md#go-further) | create a local skill and tune its trigger |
| `octocode-documentation` | [5](./workshop/5.md#go-further) | write docs checked against the repo |

## If you get stuck

| Problem | Fix |
|---|---|
| GitHub auth fails | `npx octocode auth status`, then `npx octocode auth login --refresh` |
| The agent does not see Octocode tools | `npx octocode install --ide <id> --check`, then restart the agent |
| `octocode skill` reports a "native binary" | A native `octocode` is first on `PATH`; run `npx -y octocode skill ...` |
| Engine warnings on install | Switch to Node 24.15+ (for example, `nvm use 24`) |
| GitHub rate limits | [Sign in](./workshop/1.md#checkpoint) or pair with a neighbor |
| `config check` says a key is unset | Put it in `~/.octocode/.env` (`npx octocode config home` prints the path), not in the repo |

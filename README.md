<p align="center">
  <img src="octocode-workshop/assets/logo_white.png" alt="Octocode logo" width="160">
</p>

<h1 align="center">Octocode Workshop</h1>

<p align="center">
  <b>Build reliable, evidence-based AI tools.</b>
</p>

<p align="center">
  <a href="https://octocode.ai"><img src="https://img.shields.io/badge/Website-octocode.ai-007ACC?style=for-the-badge" alt="octocode.ai"></a>
  <a href="https://github.com/bgauryy/octocode"><img src="https://img.shields.io/badge/GitHub-bgauryy%2Foctocode-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub: bgauryy/octocode"></a>
</p>

---

## About this repository

This is the workshop repository for [Octocode](https://octocode.ai), an open-source research layer that gives AI coding agents cited evidence from local code, GitHub, and npm. The workshop connects how language models use context to how Octocode finds, reads, and cites source code.

The repository has two parts:

| Part | Path | What it is |
|---|---|---|
| **Slides** | [`octocode-workshop/index.html`](./octocode-workshop/index.html) | The presentation deck. Slide order is in [`octodeck.json`](./octocode-workshop/octodeck.json); each slide is a file in [`slides/`](./octocode-workshop/slides/). |
| **Workshops** | [`workshop/`](./workshop/) | Five hands-on practice pages: [1](./workshop/1.md) · [2](./workshop/2.md) · [3](./workshop/3.md) · [4](./workshop/4.md) · [5](./workshop/5.md). Each hands-on slide in the deck links to one of them. |

## Open the slides

The deck loads `octodeck.json`, so serve the folder; do not open `index.html` as a `file://` page.

```bash
npx serve octocode-workshop
```

Press `P` for speaker notes and `G` for the slide grid.

## Repository layout

```text
.
├── README.md
├── octocode-workshop/     slides: index.html, octodeck.json, slides/, css/, assets/
└── workshop/              practice pages 1-5
```

## References

- Website: [octocode.ai](https://octocode.ai)
- Octocode source and install docs: [github.com/bgauryy/octocode](https://github.com/bgauryy/octocode)
- This repository: [github.com/bgauryy/octocode-workshop](https://github.com/bgauryy/octocode-workshop)

# Agent Evals Workshop

**From "what is an eval?" to GitHub Copilot Evals.** The source of the workshop site: a hands-on workshop for developers that teaches the basics of evaluating AI agents, has participants write and run evals by hand with [Vally](https://microsoft.github.io/vally/), and then lets [GitHub Copilot Evals](https://github.github.io/evals/) help them create, review, run and compare evals.

**[Open the workshop](https://jeffrey-groneberg.github.io/agent-evals-workshop/)** · **[中文版](https://jeffrey-groneberg.github.io/agent-evals-workshop/zh-cn/)**

## Two repositories

| Repository | What it holds | Who uses it |
| --- | --- | --- |
| [agent-evals-workshop](https://github.com/jeffrey-groneberg/agent-evals-workshop) (this one) | The site: concepts, labs and reference, in English and Simplified Chinese | Everyone reads it |
| [agent-evals-workshop-starter](https://github.com/jeffrey-groneberg/agent-evals-workshop-starter) | The project participants work in: the skill under test, evals, lab files, solutions, scripts and the Codespace | Participants copy it from the template and open it in a Codespace or VS Code |

## What participants do

They evaluate a small agent skill that drafts release notes from a backlog and has a bug: it announces work that isn't finished. They measure the bug, fix it, prove the fix with a controlled experiment, add an LLM judge (on GitHub Copilot, or on their own model endpoint if they have one), and finish with GitHub Copilot Evals. Along the way, they learn to read every part of a run themselves: the summary, the trial records with the agent's transcript, and Vally's dashboard. The guided part takes about two hours; three more labs (CI, comparing models, their own agent) are self-paced.

## Build the site

```bash
cd docs
npm ci
npm run dev        # preview at http://localhost:4321/agent-evals-workshop/
npm run build      # static site in docs/dist
```

The site is [Astro](https://astro.build/) with [Starlight](https://starlight.astro.build/) and the Terminal theme. English pages are in `docs/src/content/docs/`, Chinese pages in `docs/src/content/docs/zh-cn/`. GitHub Actions publishes `main` to GitHub Pages.

## Keep the site and the starter in sync

The labs quote the starter's files and show output from real runs. `tools/verify-starter.sh` checks the starter without calling any model: it lints every eval, runs the free mock control eval and checks its expected pattern, walks through every catch-up state, plans both experiments, and compares every file quoted on the site with the starter. The **Verify starter** workflow runs it on changes and weekly. To run it locally:

```bash
git clone https://github.com/jeffrey-groneberg/agent-evals-workshop-starter ../agent-evals-workshop-starter
npm install -g @microsoft/vally-cli@0.21.0
tools/verify-starter.sh ../agent-evals-workshop-starter
```

## Keep the two languages in step

Every Chinese page mirrors an English page. `npm run check:translation` (in `docs/`) compares each pair: the Chinese page must compile, keep the same headings, code blocks, links, images and components, and use Chinese spacing and punctuation. It also flags text that looks untranslated. After you change an English page, update its Chinese page, then run:

```bash
cd docs
npm run check:translation                      # every page
npm run check:translation -- --fix-anchors     # point #anchors at the translated headings
```

The **Docs** workflow runs the check on every build and reports problems without blocking the deployment.

## Author

Created by **Jeffrey Groneberg**, Senior Solution Engineer at Microsoft Germany. Connect on [LinkedIn](https://www.linkedin.com/in/jeffrey-groneberg-84b47412). Feedback and fixes are welcome as issues or pull requests.

This is a community workshop, not official Microsoft or GitHub documentation. For the tools themselves, the [Vally docs](https://microsoft.github.io/vally/) and the [GitHub Copilot Evals docs](https://github.github.io/evals/) are the reference.

## License

[MIT](LICENSE). The illustrations are AI-generated (MAI-Image-2.6).

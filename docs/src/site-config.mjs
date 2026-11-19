// Where the site is published: a GitHub Pages project site. DOCS_SITE and DOCS_BASE retarget a build,
// for example DOCS_BASE=/ to preview it at the root of another host.
const rawBase = process.env.DOCS_BASE || '/agent-evals-workshop/';

export const base = `/${rawBase.replace(/^\/+|\/+$/g, '')}/`.replace(/\/{2,}/g, '/');
export const site = process.env.DOCS_SITE || 'https://jeffrey-groneberg.github.io';
export const repository = 'https://github.com/jeffrey-groneberg/agent-evals-workshop';
export const author = {
  name: 'Jeffrey Groneberg',
  linkedin: 'https://www.linkedin.com/in/jeffrey-groneberg-84b47412',
};
// The tool versions the labs were tested with, shown in the header badge.
export const testedWith = 'Vally 0.21.0';
// The repository participants copy and work in.
export const starterRepository = 'https://github.com/jeffrey-groneberg/agent-evals-workshop-starter';

// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import starlight from '@astrojs/starlight';
import starlightThemeTerminal from 'starlight-theme-terminal';
import { site, base, repository, author } from './src/site-config.mjs';

export default defineConfig({
  site,
  base,
  integrations: [
    starlight({
      title: { en: 'Agent Evals Workshop', 'zh-CN': '智能体评估工作坊' },
      description:
        'A hands-on workshop for developers: from what an eval is to writing evals with Vally and GitHub Copilot Evals.',
      favicon: '/favicon.svg',
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        'zh-cn': { label: '简体中文', lang: 'zh-CN' },
      },
      head: [{ tag: 'meta', attrs: { name: 'author', content: author.name } }],
      plugins: [starlightThemeTerminal()],
      customCss: ['./src/styles/custom.css'],
      // Long commands wrap instead of hiding their end behind a horizontal scroll.
      expressiveCode: { defaultProps: { overridesByLang: { 'bash,sh,shell,console,powershell,text': { wrap: true } } } },
      components: {
        SiteTitle: './src/components/SiteTitle.astro',
        Footer: './src/components/Footer.astro',
      },
      social: [
        { icon: 'github', label: 'Source on GitHub', href: repository },
        { icon: 'linkedin', label: `${author.name} on LinkedIn`, href: author.linkedin },
      ],
      editLink: { baseUrl: `${repository}/edit/main/docs/` },
      sidebar: [
        {
          label: 'Start here',
          translations: { 'zh-CN': '从这里开始' },
          items: ['start/overview', 'start/codespaces', 'start/local', 'start/model-access'],
        },
        {
          label: 'Concepts',
          translations: { 'zh-CN': '核心概念' },
          items: [
            'concepts/what-is-an-eval',
            'concepts/anatomy',
            'concepts/graders',
            'concepts/trials-and-metrics',
            'concepts/llm-judges',
            'concepts/comparing-changes',
            'concepts/tools',
            'concepts/glossary',
          ],
        },
        {
          label: 'Guided labs',
          translations: { 'zh-CN': '引导练习' },
          items: [
            'labs/lab-0-setup',
            'labs/lab-1-define-good',
            'labs/lab-2-check-your-checks',
            'labs/lab-3-run-the-agent',
            'labs/lab-4-fix-and-prove',
            'labs/lab-5-llm-judge',
            'labs/lab-6-copilot-evals',
          ],
        },
        {
          label: 'Self-paced labs',
          translations: { 'zh-CN': '自定进度练习' },
          items: ['labs/lab-7-ci', 'labs/lab-8-compare-models', 'labs/lab-9-your-own'],
        },
        {
          label: 'Reference',
          translations: { 'zh-CN': '参考' },
          items: [
            'reference/vally-cheatsheet',
            'reference/copilot-evals-cheatsheet',
            'reference/troubleshooting',
            'reference/facilitator-guide',
            'reference/further-learning',
          ],
        },
      ],
    }),
    // After Starlight, which then adds no MDX of its own. Astro 6.4 no longer passes its GFM and smart-punctuation
    // defaults to MDX 5, so without these, tables in .mdx pages stay plain text.
    mdx({ gfm: true, smartypants: true, optimize: true }),
  ],
});

#!/usr/bin/env node
// Checks every translated page against its English source, so the two languages stay in step:
//   errors:   the page doesn't parse or compile, its frontmatter is invalid or has other keys, an import or image
//             doesn't resolve, a code block differs from the English one, the headings differ in number or level,
//             it links to other pages than the English page, an #anchor points to a heading that doesn't exist,
//             or bold markers don't pair up and would show as literal **.
//   warnings: text that looks untranslated, and Chinese spacing and punctuation slips.
// With --fix-anchors, #anchors into translated pages are rewritten to the translated heading IDs, matched by
// heading position (the headings must already line up).
//
// Usage, from docs/:
//   npm run check:translation                                      every page, Chinese
//   npm run check:translation -- labs/lab-2-check-your-checks.mdx  one page (its path below src/content/docs/)
//   npm run check:translation -- --fix-anchors
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { compile } from '@mdx-js/mdx';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMdx from 'remark-mdx';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import { toString } from 'mdast-util-to-string';
import GithubSlugger from 'github-slugger';

const docsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = path.join(docsDir, 'src/content/docs');
const args = process.argv.slice(2);
const fixAnchors = args.includes('--fix-anchors');
const locale = (args.find((a) => a.startsWith('--locale=')) ?? '--locale=zh-cn').slice('--locale='.length);
const requested = args
	.filter((a) => !a.startsWith('--'))
	.map((a) => a.replace(/^(docs\/)?(src\/content\/docs\/)?/, '').replace(new RegExp(`^${locale}/`), ''));

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff]/;
const CJK_LATIN = /[\u3400-\u4dbf\u4e00-\u9fff][A-Za-z0-9]|[A-Za-z0-9][\u3400-\u4dbf\u4e00-\u9fff]/g;
const HALF_WIDTH = /[\u3400-\u4dbf\u4e00-\u9fff][,;:!?()]|[()][\u3400-\u4dbf\u4e00-\u9fff]|[\u3400-\u4dbf\u4e00-\u9fff]\.(?=\s|$)/g;
const KEEP_KEYS = new Set(['template', 'editUrl', 'icon', 'variant', 'order', 'tableOfContents', 'pagefind', 'draft']);
const TEXT_KEYS = new Set(['title', 'description', 'tagline', 'text', 'alt', 'label']);
const PROP_KEYS = new Set(['term', 'def', 'analogy', 'where', 'label', 'detail', 'caption', 'title', 'text']);
const ATTR_KEYS = new Set(['title', 'label', 'caption', 'description', 'alt', 'time', 'cost', 'doing', 'testing', 'checking']);

const walk = (dir) =>
	fs.existsSync(dir)
		? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
		: [];
const rel = (file) => path.relative(contentDir, file).split(path.sep).join('/');
const isPage = (f) => /\.mdx?$/.test(f);
const englishPages = walk(contentDir)
	.filter(isPage)
	.map(rel)
	.filter((p) => !p.startsWith(`${locale}/`))
	.sort();
const translatedPages = walk(path.join(contentDir, locale)).filter(isPage).map(rel).sort();

const parser = unified().use(remarkParse).use(remarkMdx).use(remarkGfm);
const cache = new Map();

function load(page) {
	if (cache.has(page)) return cache.get(page);
	const file = path.join(contentDir, page);
	const raw = fs.readFileSync(file, 'utf8');
	const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
	const body = m ? raw.slice(m[0].length) : raw;
	const lineOffset = m ? m[0].split('\n').length - 1 : 0;
	const doc = { page, file, raw, body, fm: {}, errors: [], warnings: [], headings: [], codes: [], links: [], imports: [], strings: [], blocks: [] };
	doc.at = (node) => (node?.position ? `line ${node.position.start.line + lineOffset}` : 'frontmatter');
	try {
		doc.fm = yaml.load(m ? m[1] : '') ?? {};
	} catch (e) {
		doc.errors.push(`frontmatter is not valid YAML: ${e.message.split('\n')[0]}`);
	}
	try {
		doc.tree = parser.parse(body);
	} catch (e) {
		doc.errors.push(`MDX doesn't parse: ${e.message}`);
	}
	// Starlight builds the page URL from the file path; index pages map to their folder.
	const slug = page.replace(/\.mdx?$/, '').replace(/(^|\/)index$/, '');
	doc.url = `/${slug}${slug ? '/' : ''}`;
	if (doc.tree) collect(doc);
	cache.set(page, doc);
	return doc;
}

function collect(doc) {
	// Astro gives each heading the GitHub-style slug of its text, without a trailing hyphen.
	const slugger = new GithubSlugger();
	visit(doc.tree, (node) => {
		if (node.type === 'heading') {
			let id = slugger.slug(toString(node));
			if (id.endsWith('-')) id = id.slice(0, -1);
			doc.headings.push({ depth: node.depth, text: toString(node), id, at: doc.at(node) });
		} else if (node.type === 'code') {
			doc.codes.push({ lang: node.lang ?? '', meta: node.meta ?? '', value: node.value, at: doc.at(node) });
		} else if (node.type === 'link' || node.type === 'definition') {
			doc.links.push({ target: node.url, kind: 'link', at: doc.at(node) });
		} else if (node.type === 'image') {
			doc.links.push({ target: node.url, kind: 'asset', at: doc.at(node) });
			if (node.alt) doc.strings.push({ text: node.alt, at: doc.at(node) });
		} else if (node.type === 'mdxjsEsm') {
			for (const mm of node.value.matchAll(/from\s+['"]([^'"]+)['"]/g)) doc.imports.push({ spec: mm[1], at: doc.at(node) });
		} else if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
			for (const attr of node.attributes ?? []) {
				if (attr.type !== 'mdxJsxAttribute') continue;
				if (typeof attr.value === 'string') {
					if (attr.name === 'href' || attr.name === 'link') doc.links.push({ target: attr.value, kind: 'link', at: doc.at(node) });
					if (attr.name === 'src') doc.links.push({ target: attr.value, kind: 'asset', at: doc.at(node) });
					if (ATTR_KEYS.has(attr.name)) doc.strings.push({ text: attr.value, at: doc.at(node) });
				} else if (attr.value?.data?.estree) {
					walkEstree(attr.value.data.estree, (text) => doc.strings.push({ text, at: doc.at(node) }));
				}
			}
		}
		if (node.type === 'paragraph' || node.type === 'tableCell' || node.type === 'heading') doc.blocks.push(node);
	});
	for (const action of doc.fm?.hero?.actions ?? []) if (action.link) doc.links.push({ target: action.link, kind: 'link', at: 'frontmatter' });
	if (doc.fm?.hero?.image?.file) doc.links.push({ target: doc.fm.hero.image.file, kind: 'asset', at: 'frontmatter' });
}

function walkEstree(node, onString) {
	if (!node || typeof node !== 'object') return;
	if (Array.isArray(node)) return node.forEach((n) => walkEstree(n, onString));
	if (node.type === 'Property' && PROP_KEYS.has(node.key?.name ?? node.key?.value) && typeof node.value?.value === 'string') {
		onString(node.value.value);
	}
	for (const [key, value] of Object.entries(node)) if (key !== 'loc' && key !== 'range' && key !== 'position') walkEstree(value, onString);
}

// A link target, reduced to what must match across languages: the page it opens, or the file it shows.
function resolveTarget(doc, link) {
	const { target, kind } = link;
	if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return { key: target.replace(/#.*$/, ''), external: true };
	if (kind === 'asset') {
		const file = path.resolve(path.dirname(doc.file), target);
		return { key: `asset:${path.relative(docsDir, file)}`, file };
	}
	const url = new URL(target, `https://site${doc.url}`);
	const pathname = decodeURI(url.pathname);
	const fragment = url.hash ? decodeURIComponent(url.hash.slice(1)) : '';
	const inLocale = pathname.startsWith(`/${locale}/`);
	return { key: `page:${inLocale ? pathname.slice(locale.length + 1) : pathname}`, pathname, fragment, inLocale };
}

function pageForPath(pathname) {
	const base = pathname.replace(/^\//, '').replace(/\/$/, '');
	const candidates = base ? [`${base}.mdx`, `${base}.md`, `${base}/index.mdx`, `${base}/index.md`] : ['index.mdx', 'index.md'];
	return candidates.find((c) => fs.existsSync(path.join(contentDir, c))) ?? null;
}

function compareFrontmatter(en, tr, prefix, errors, warnings) {
	if (Array.isArray(en)) {
		if (!Array.isArray(tr) || tr.length !== en.length) return errors.push(`frontmatter ${prefix} should have ${en.length} items`);
		return en.forEach((v, i) => compareFrontmatter(v, tr[i], `${prefix}[${i}]`, errors, warnings));
	}
	if (en && typeof en === 'object') {
		if (!tr || typeof tr !== 'object') return errors.push(`frontmatter ${prefix} should be an object`);
		const a = Object.keys(en).sort().join(', ');
		const b = Object.keys(tr).sort().join(', ');
		if (a !== b) errors.push(`frontmatter ${prefix || '(top level)'} keys differ: English has [${a}], translation has [${b}]`);
		for (const key of Object.keys(en)) if (key in tr) compareFrontmatter(en[key], tr[key], prefix ? `${prefix}.${key}` : key, errors, warnings);
		return;
	}
	const key = prefix.split('.').pop().replace(/\[\d+\]$/, '');
	if (KEEP_KEYS.has(key) && en !== tr) errors.push(`frontmatter ${prefix} must stay ${JSON.stringify(en)}`);
	if (TEXT_KEYS.has(key) && typeof en === 'string' && en === tr && /[a-z]{3,}.*\s.*[a-z]{3,}/i.test(en)) {
		warnings.push(`frontmatter ${prefix} is still English`);
	}
}

function checkChineseText(doc) {
	const latin = /[A-Za-z0-9`]/;
	const near = (a, b) => (CJK.test(a) && latin.test(b)) || (latin.test(a) && CJK.test(b));
	for (const block of doc.blocks) {
		const prose = [];
		visit(block, (n) => {
			if (n.type === 'inlineCode' || n.type === 'code') return 'skip';
			if (n.type === 'text') prose.push(n.value);
			return undefined;
		});
		const text = prose.join('');
		const where = doc.at(block);
		// Bold or italic markers that Markdown couldn't pair stay in the text and show literally. In Chinese this
		// happens when the bold ends in full-width punctuation and a Chinese character follows: **原因明确。**如果.
		const marks = [...text.matchAll(/\*\*|__/g)];
		for (let k = 0; k < marks.length; k += 2) {
			const from = Math.max(0, marks[k].index - 4);
			const to = (marks[k + 1]?.index ?? marks[k].index) + 6;
			doc.errors.push(`${where}: bold markers show literally in "${text.slice(from, to).replace(/\n/g, ' ')}": move full-width punctuation outside the bold (**原因明确**。如果), or add a space between inline code and Chinese text`);
		}
		for (const mm of text.matchAll(/(?<![*\\])\*(?!\*)/g)) {
			doc.warnings.push(`${where}: a single "*" shows literally in "${text.slice(Math.max(0, mm.index - 8), mm.index + 8).replace(/\n/g, ' ')}"`);
		}
		if (!CJK.test(text) && (text.match(/[A-Za-z]{2,}/g) ?? []).length >= 6) doc.warnings.push(`${where}: looks untranslated: "${text.slice(0, 70)}…"`);
		for (const mm of text.matchAll(CJK_LATIN)) doc.warnings.push(`${where}: add a space between Chinese and Latin text: "${mm[0]}"`);
		for (const mm of text.matchAll(HALF_WIDTH)) doc.warnings.push(`${where}: use full-width punctuation: "${mm[0]}"`);
		// Inline code, links and bold text next to Chinese characters need a space as well.
		visit(block, (n) => {
			const kids = n.children ?? [];
			for (let i = 0; i + 1 < kids.length; i++) {
				if (kids[i].type === 'text' && kids[i + 1].type === 'text') continue;
				const left = kids[i].type === 'inlineCode' ? `${kids[i].value}\`` : toString(kids[i]);
				const right = kids[i + 1].type === 'inlineCode' ? `\`${kids[i + 1].value}` : toString(kids[i + 1]);
				if (left && right && near(left.slice(-1), right[0])) {
					doc.warnings.push(`${where}: add a space between "…${left.slice(-6)}" and "${right.slice(0, 6)}…"`);
				}
			}
		});
	}
	for (const s of doc.strings) {
		const plain = s.text.replace(/<code>.*?<\/code>/g, '').replace(/`[^`]*`/g, '');
		// Component props are HTML, not Markdown: **bold** would show with its asterisks.
		if (/\*\*|__/.test(plain)) doc.errors.push(`${s.at}: component text uses Markdown bold, which shows literally there; use <strong>…</strong>: "${s.text.slice(0, 60)}"`);
		if (!CJK.test(plain) && (plain.match(/[A-Za-z]{2,}/g) ?? []).length >= 3) {
			doc.warnings.push(`${s.at}: component text looks untranslated: "${s.text.slice(0, 60)}"`);
		}
		for (const mm of plain.matchAll(CJK_LATIN)) doc.warnings.push(`${s.at}: add a space between Chinese and Latin text: "${mm[0]}"`);
	}
}

// Anchors in a translated page point to translated headings. Map an English heading ID to the translated
// heading in the same position on the same page.
function checkAnchors(doc) {
	let text = doc.raw;
	for (const link of doc.links) {
		if (link.kind !== 'link') continue;
		const r = resolveTarget(doc, link);
		if (r.external || !r.fragment) continue;
		let targetPage = pageForPath(r.pathname);
		if (!targetPage && r.inLocale) targetPage = pageForPath(r.pathname.slice(locale.length + 1));
		if (!targetPage) {
			doc.errors.push(`${link.at}: page not found: ${link.target}`);
			continue;
		}
		const target = load(targetPage);
		if (target.headings.some((h) => h.id === r.fragment)) continue;
		const enTarget = r.inLocale && targetPage.startsWith(`${locale}/`) ? load(targetPage.slice(locale.length + 1)) : null;
		const index = enTarget ? enTarget.headings.findIndex((h) => h.id === r.fragment) : -1;
		const mapped = index >= 0 && enTarget.headings.length === target.headings.length ? target.headings[index].id : null;
		if (fixAnchors && mapped) {
			const fixed = link.target.replace(/#.*$/, `#${mapped}`);
			const before = text;
			text = text.split(`](${link.target})`).join(`](${fixed})`).split(`href="${link.target}"`).join(`href="${fixed}"`);
			if (text !== before) {
				doc.fixed = (doc.fixed ?? 0) + 1;
				continue;
			}
		}
		doc.errors.push(`${link.at}: anchor #${r.fragment} not found on ${targetPage}${mapped ? ` (it is #${mapped}; run with --fix-anchors)` : ''}`);
	}
	if (doc.fixed) fs.writeFileSync(doc.file, text);
}

async function checkPair(enPage) {
	const trPage = `${locale}/${enPage}`;
	if (!fs.existsSync(path.join(contentDir, trPage))) return { page: trPage, missing: true };
	const en = load(enPage);
	const tr = load(trPage);
	const { errors, warnings } = tr;
	if (tr.tree) {
		try {
			await compile(tr.body, { remarkPlugins: [remarkGfm] });
		} catch (e) {
			errors.push(`MDX doesn't compile: ${e.message}`);
		}
	}
	compareFrontmatter(en.fm, tr.fm, '', errors, warnings);

	for (const imp of tr.imports) {
		if (imp.spec.startsWith('.') && !fs.existsSync(path.resolve(path.dirname(tr.file), imp.spec))) {
			errors.push(`${imp.at}: import not found: ${imp.spec}`);
		}
	}
	const names = (doc) => doc.imports.map((i) => path.basename(i.spec)).sort().join(', ');
	if (names(en) !== names(tr)) errors.push(`imports differ: English imports [${names(en)}], translation imports [${names(tr)}]`);

	if (en.codes.length !== tr.codes.length) errors.push(`${tr.codes.length} code blocks, English has ${en.codes.length}`);
	en.codes.forEach((code, i) => {
		const other = tr.codes[i];
		if (!other) return;
		if (other.lang !== code.lang || other.meta !== code.meta) {
			errors.push(`${other.at}: code block ${i + 1} must start with \`\`\`${code.lang} ${code.meta}`.trimEnd());
		}
		if (other.value !== code.value) {
			const a = code.value.split('\n');
			const b = other.value.split('\n');
			const line = Math.max(0, a.findIndex((l, j) => l !== b[j]));
			errors.push(`${other.at}: code block ${i + 1} differs from English at its line ${line + 1}: "${(b[line] ?? '').slice(0, 50)}", English: "${(a[line] ?? '').slice(0, 50)}"`);
		}
	});

	const shape = (doc) => doc.headings.map((h) => `h${h.depth}`).join(' ');
	if (shape(en) !== shape(tr)) {
		errors.push(`headings differ (keep one translated heading per English heading, same order and level):\n      English:     ${shape(en) || '(none)'}\n      translation: ${shape(tr) || '(none)'}`);
	}

	const count = (doc) => {
		const map = new Map();
		for (const link of doc.links) {
			const r = resolveTarget(doc, link);
			// A translated page may link to the English version of a page on purpose.
			if (doc === tr && r.key.startsWith('page:') && !r.inLocale && r.pathname !== '/' && !en.links.some((l) => resolveTarget(en, l).key === r.key)) continue;
			map.set(r.key, (map.get(r.key) ?? 0) + 1);
		}
		return map;
	};
	const enLinks = count(en);
	const trLinks = count(tr);
	for (const [key, n] of enLinks) if ((trLinks.get(key) ?? 0) < n) errors.push(`link missing: ${key.replace(/^(page|asset):/, '')} (the English page has it ${n}x)`);
	for (const [key, n] of trLinks) if ((enLinks.get(key) ?? 0) < n) errors.push(`extra link: ${key.replace(/^(page|asset):/, '')} (not in the English page)`);
	for (const link of tr.links) {
		const r = resolveTarget(tr, link);
		if (r.file && !fs.existsSync(r.file)) errors.push(`${link.at}: file not found: ${link.target}`);
	}

	checkAnchors(tr);
	checkChineseText(tr);
	return { page: trPage, errors, warnings };
}

const results = [];
for (const page of requested.length ? requested : englishPages) {
	if (!englishPages.includes(page)) results.push({ page, errors: [`no English page src/content/docs/${page}`], warnings: [] });
	else results.push(await checkPair(page));
}
if (!requested.length) {
	for (const page of translatedPages) {
		if (!englishPages.includes(page.slice(locale.length + 1))) results.push({ page, errors: ['no English page with this path'], warnings: [] });
	}
}

let errorCount = 0;
let warningCount = 0;
let missing = 0;
for (const r of results) {
	if (r.missing) {
		missing++;
		if (requested.length) {
			console.log(`✘ ${r.page}: not translated yet`);
			errorCount++;
		}
		continue;
	}
	const fixed = cache.get(r.page)?.fixed;
	errorCount += r.errors.length;
	warningCount += r.warnings.length;
	console.log(`${r.errors.length ? '✘' : r.warnings.length ? '!' : '✔'} ${r.page}${fixed ? ` (${fixed} anchors fixed)` : ''}`);
	for (const e of r.errors) console.log(`    error: ${e}`);
	for (const w of r.warnings) console.log(`    warning: ${w}`);
}
console.log(`\n${results.length - missing} translated, ${missing} not translated yet, ${errorCount} errors, ${warningCount} warnings`);
process.exit(errorCount ? 1 : 0);

// Pre-render blog content as static HTML files so Googlebot (and any other
// crawler that doesn't execute JS) sees real article content on first byte.
// Same pattern as RepCrew: runs after `vite build`, reads BLOG_POSTS, renders
// each post's markdown to HTML, wraps it in a complete styled page, and
// writes to dist/blog/<slug>/index.html. Vercel serves static files before
// the SPA catch-all rewrite, so these take over for the corresponding URLs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { BLOG_POSTS } from '../src/data/blogPosts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');
const BLOG_DIR = path.join(DIST, 'blog');

// Brand tokens — mirrored from src/components/brand/tokens.js
const B = {
  navy: '#1B2A4A', navyLight: '#243556',
  teal: '#2A7D6E', tealLight: '#34957F', tealPale: '#E6F5F1',
  cream: '#FAFAF7', warmGray: '#F2F0EB', sand: '#E8E4DC',
  textDark: '#1B2A4A', textMid: '#5A6477', textLight: '#8B93A1',
  white: '#FFFFFF',
};

function escapeHTML(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

function buildHead({ title, description, canonical, ogType = 'website', jsonLd }) {
  const fullTitle = `${title} — ChurchOpsHub`;
  return `
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHTML(fullTitle)}</title>
    <meta name="description" content="${escapeHTML(description)}">
    <link rel="canonical" href="${escapeHTML(canonical)}">
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">

    <meta property="og:title" content="${escapeHTML(fullTitle)}">
    <meta property="og:description" content="${escapeHTML(description)}">
    <meta property="og:type" content="${ogType}">
    <meta property="og:url" content="${escapeHTML(canonical)}">

    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHTML(fullTitle)}">
    <meta name="twitter:description" content="${escapeHTML(description)}">

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet">
    ${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}
  `.trim();
}

const PAGE_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Source Sans 3', -apple-system, BlinkMacSystemFont, sans-serif;
    background: ${B.cream};
    color: ${B.textDark};
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  a { color: ${B.teal}; }
  .nav {
    background: ${B.navy};
    padding: 14px 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 100;
  }
  .nav a { text-decoration: none; }
  .logo-wrap { display: flex; align-items: center; gap: 10px; color: ${B.white}; font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 18px; }
  .nav-right { display: flex; gap: 18px; align-items: center; }
  .nav-right .blog-link { color: rgba(255,255,255,0.65); font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 600; }
  .nav-right .cta { padding: 9px 20px; background: ${B.teal}; border-radius: 8px; color: ${B.white}; font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 600; }
  main.article { max-width: 760px; margin: 0 auto; padding: 56px 40px 96px; }
  .back-link { font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 600; color: ${B.teal}; text-decoration: none; display: inline-block; margin-bottom: 28px; }
  .post-date { font-size: 13px; color: ${B.textLight}; font-family: 'Outfit', sans-serif; margin-bottom: 12px; }
  h1.title { font-family: 'Outfit', sans-serif; font-size: 38px; font-weight: 800; color: ${B.navy}; margin: 0 0 24px; line-height: 1.15; letter-spacing: -0.5px; }
  .description { font-size: 18px; color: ${B.textMid}; margin: 0 0 40px; line-height: 1.55; }
  .accent-bar { height: 2px; background: ${B.teal}; width: 48px; border-radius: 2px; margin-bottom: 40px; }
  .post-content h2 { font-family: 'Outfit', sans-serif; font-size: 22px; font-weight: 700; color: ${B.navy}; margin: 36px 0 14px; line-height: 1.3; }
  .post-content h3 { font-family: 'Outfit', sans-serif; font-size: 17px; font-weight: 700; color: ${B.navy}; margin: 28px 0 10px; line-height: 1.4; }
  .post-content p { font-size: 16px; color: ${B.textMid}; margin: 0 0 18px; line-height: 1.75; }
  .post-content a { color: ${B.teal}; text-decoration: underline; text-underline-offset: 2px; text-decoration-thickness: 1px; }
  .post-content ul, .post-content ol { font-size: 16px; color: ${B.textMid}; margin: 0 0 18px; padding-left: 24px; line-height: 1.75; }
  .post-content li { margin: 0 0 8px; }
  .post-content strong { font-weight: 700; color: ${B.navy}; }
  .post-content em { font-style: italic; }
  .post-content blockquote { border-left: 3px solid ${B.teal}; margin: 22px 0; padding: 4px 0 4px 20px; font-style: italic; color: ${B.textMid}; font-size: 17px; line-height: 1.7; }
  .post-content code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14px; background: ${B.sand}; padding: 2px 6px; border-radius: 4px; color: ${B.navy}; }
  .post-content pre { background: ${B.navy}; color: ${B.cream}; padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 14px; line-height: 1.6; margin: 20px 0; }
  .post-content pre code { background: transparent; color: ${B.cream}; padding: 0; }
  .post-content hr { border: none; border-top: 1px solid ${B.sand}; margin: 32px 0; }
  .post-content table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 15px; }
  .post-content th, .post-content td { padding: 10px 12px; border: 1px solid ${B.sand}; text-align: left; }
  .post-content th { background: ${B.warmGray}; font-family: 'Outfit', sans-serif; font-weight: 700; color: ${B.navy}; }
  .divider { height: 1px; background: ${B.sand}; margin: 48px 0 40px; }
  .cta-box { background: ${B.navy}; border-radius: 16px; padding: 36px 40px; text-align: center; }
  .cta-box h2 { font-family: 'Outfit', sans-serif; font-size: 24px; font-weight: 700; color: ${B.white}; margin: 0 0 12px; }
  .cta-box p { font-size: 15px; color: rgba(255,255,255,0.7); margin: 0 0 24px; line-height: 1.6; }
  .cta-box a.btn { display: inline-block; background: ${B.teal}; color: ${B.white}; padding: 13px 28px; font-size: 15px; font-weight: 600; font-family: 'Outfit', sans-serif; border-radius: 8px; text-decoration: none; }
  .related { margin-top: 56px; }
  .related h3 { font-family: 'Outfit', sans-serif; font-size: 18px; font-weight: 700; color: ${B.navy}; margin-bottom: 20px; }
  .related-list { display: flex; flex-direction: column; gap: 14px; }
  .related-card { background: ${B.white}; border-radius: 12px; padding: 20px 24px; border: 1px solid ${B.sand}; text-decoration: none; display: block; transition: border-color .15s; }
  .related-card:hover { border-color: ${B.teal}; }
  .related-card .rtitle { font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 15px; color: ${B.navy}; margin-bottom: 6px; }
  .related-card .rdesc { font-size: 13px; color: ${B.textLight}; line-height: 1.55; }
  footer.site-footer { background: ${B.navy}; padding: 36px 40px; margin-top: 60px; }
  .footer-inner { max-width: 1100px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; gap: 20px; flex-wrap: wrap; }
  .footer-inner a { color: rgba(255,255,255,0.55); font-size: 14px; text-decoration: none; font-family: 'Outfit', sans-serif; }
  .footer-copy { font-size: 13px; color: rgba(255,255,255,0.35); font-family: 'Outfit', sans-serif; }
  main.blog-index { max-width: 840px; margin: 0 auto; padding: 56px 40px 96px; }
  main.blog-index .header h1 { font-family: 'Outfit', sans-serif; font-size: 38px; font-weight: 800; color: ${B.navy}; margin: 0 0 16px; line-height: 1.1; letter-spacing: -0.5px; }
  main.blog-index .header p { font-size: 17px; color: ${B.textMid}; margin: 0 0 48px; line-height: 1.5; }
  .post-list { display: flex; flex-direction: column; gap: 20px; }
  .post-list .post-card { background: ${B.white}; border-radius: 12px; padding: 28px 32px; border: 1px solid ${B.sand}; text-decoration: none; display: block; transition: border-color .15s; }
  .post-list .post-card:hover { border-color: ${B.teal}; }
  .post-list .post-card .pdate { font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 600; color: ${B.textLight}; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 8px; }
  .post-list .post-card .ptitle { font-family: 'Outfit', sans-serif; font-size: 20px; font-weight: 700; color: ${B.navy}; margin-bottom: 10px; line-height: 1.3; }
  .post-list .post-card .pdesc { font-size: 14px; color: ${B.textMid}; line-height: 1.6; }
  @media (max-width: 768px) {
    .nav { padding: 14px 20px; }
    main.article, main.blog-index { padding: 44px 24px 80px; }
    h1.title, main.blog-index .header h1 { font-size: 28px; }
    .cta-box { padding: 28px 24px; }
    .cta-box h2 { font-size: 20px; }
    footer.site-footer { padding: 28px 24px; }
    .footer-inner { flex-direction: column; align-items: flex-start; }
  }
`;

function navHTML() {
  return `
    <nav class="nav">
      <a href="/">
        <span class="logo-wrap">
          <svg width="28" height="28" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect x="4" y="6" width="24" height="22" rx="3" fill="${B.teal}"/>
            <rect x="9" y="14" width="14" height="2" fill="${B.cream}"/>
            <rect x="9" y="18" width="14" height="2" fill="${B.cream}"/>
            <rect x="9" y="22" width="9" height="2" fill="${B.cream}"/>
            <path d="M16 2 L20 6 L12 6 Z" fill="${B.teal}"/>
          </svg>
          ChurchOpsHub
        </span>
      </a>
      <div class="nav-right">
        <a href="/blog" class="blog-link">Blog</a>
        <a href="/?signup" class="cta">Get Started</a>
      </div>
    </nav>
  `.trim();
}

function footerHTML() {
  const year = new Date().getFullYear();
  return `
    <footer class="site-footer">
      <div class="footer-inner">
        <a href="/">
          <span class="logo-wrap" style="color: rgba(255,255,255,0.85);">
            <svg width="24" height="24" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect x="4" y="6" width="24" height="22" rx="3" fill="${B.teal}"/>
              <rect x="9" y="14" width="14" height="2" fill="${B.cream}"/>
              <rect x="9" y="18" width="14" height="2" fill="${B.cream}"/>
              <rect x="9" y="22" width="9" height="2" fill="${B.cream}"/>
            </svg>
            ChurchOpsHub
          </span>
        </a>
        <div style="display: flex; gap: 24px;">
          <a href="/">Home</a>
          <a href="/blog">Blog</a>
          <a href="/?help">Help</a>
          <a href="/?privacy">Privacy</a>
        </div>
        <div class="footer-copy">© ${year} ChurchOpsHub</div>
      </div>
    </footer>
  `.trim();
}

function renderPost(post, allPosts) {
  const canonical = `https://churchopshub.com/blog/${post.slug}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: { '@type': 'Organization', name: 'ChurchOpsHub' },
    publisher: { '@type': 'Organization', name: 'ChurchOpsHub', url: 'https://churchopshub.com' },
    url: canonical,
    keywords: post.keywords,
  };

  const contentHTML = marked.parse(post.content, { gfm: true, breaks: false });

  const related = allPosts
    .filter(p => p.slug !== post.slug)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);

  const relatedHTML = related.length ? `
    <div class="related">
      <h3>Keep Reading</h3>
      <div class="related-list">
        ${related.map(r => `
          <a class="related-card" href="/blog/${escapeHTML(r.slug)}">
            <div class="rtitle">${escapeHTML(r.title)}</div>
            <div class="rdesc">${escapeHTML(r.description)}</div>
          </a>
        `).join('')}
      </div>
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
${buildHead({ title: post.title, description: post.description, canonical, ogType: 'article', jsonLd })}
<style>${PAGE_CSS}</style>
</head>
<body>
${navHTML()}
<main class="article">
  <a href="/blog" class="back-link">← All Articles</a>
  <div class="post-date">${formatDate(post.date)}</div>
  <h1 class="title">${escapeHTML(post.title)}</h1>
  <p class="description">${escapeHTML(post.description)}</p>
  <div class="accent-bar"></div>
  <div class="post-content">${contentHTML}</div>
  <div class="divider"></div>
  <div class="cta-box">
    <h2>Run your church on one platform.</h2>
    <p>Inventory Hub is free forever. Add paid hubs for maintenance, scheduling, accountability, and more. 90-day free trial.</p>
    <a class="btn" href="/?signup">Start Free Trial →</a>
  </div>
${relatedHTML}
</main>
${footerHTML()}
</body>
</html>
`;
}

function renderIndex(allPosts) {
  const canonical = 'https://churchopshub.com/blog';
  const sorted = allPosts.slice().sort((a, b) => b.date.localeCompare(a.date));
  const listHTML = sorted.map(p => `
    <a class="post-card" href="/blog/${escapeHTML(p.slug)}">
      <div class="pdate">${formatDate(p.date)}</div>
      <div class="ptitle">${escapeHTML(p.title)}</div>
      <div class="pdesc">${escapeHTML(p.description)}</div>
    </a>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
${buildHead({ title: 'Blog', description: 'Practical guides for church operations: inventory, volunteers, maintenance, compliance, and scheduling.', canonical })}
<style>${PAGE_CSS}</style>
</head>
<body>
${navHTML()}
<main class="blog-index">
  <div class="header">
    <h1>The ChurchOpsHub Blog</h1>
    <p>Practical guides for running your church operations: inventory, volunteers, maintenance, compliance, and scheduling.</p>
  </div>
  <div class="post-list">${listHTML}</div>
</main>
${footerHTML()}
</body>
</html>
`;
}

function main() {
  if (!fs.existsSync(DIST)) {
    console.error(`prerender-blog: dist/ does not exist. Run 'vite build' first.`);
    process.exit(1);
  }

  fs.mkdirSync(BLOG_DIR, { recursive: true });

  let count = 0;
  for (const post of BLOG_POSTS) {
    const postDir = path.join(BLOG_DIR, post.slug);
    fs.mkdirSync(postDir, { recursive: true });
    const html = renderPost(post, BLOG_POSTS);
    fs.writeFileSync(path.join(postDir, 'index.html'), html, 'utf-8');
    count++;
  }

  fs.writeFileSync(path.join(BLOG_DIR, 'index.html'), renderIndex(BLOG_POSTS), 'utf-8');

  console.log(`prerender-blog: wrote ${count} post pages + 1 index page → dist/blog/`);
}

main();

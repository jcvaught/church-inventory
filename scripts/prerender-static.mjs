// Pre-render public marketing/legal/help pages as static HTML so Googlebot
// sees full content on first byte. Same pattern as RepCrew but with more
// pages — COH has path-based routes for /help, /terms, /privacy, and
// /sms-program in addition to the landing page.
//
// Polyfills window/document because several COH pages read window.innerWidth
// in useState lazy initializers (responsive layout state). The polyfill
// runs before any module imports so Vite SSR can resolve the components
// without hitting "window is not defined".

globalThis.window = {
  location: { search: '', pathname: '/', href: 'https://churchopshub.com/' },
  innerWidth: 1024,
  innerHeight: 800,
  matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  addEventListener: () => {},
  removeEventListener: () => {},
};
globalThis.document = {
  documentElement: { style: {} },
  body: { style: {} },
  addEventListener: () => {},
  removeEventListener: () => {},
};

import { createServer } from 'vite';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { HelmetProvider } from 'react-helmet-async';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const ROUTES = [
  {
    url: '/',
    modulePath: '/src/pages/LandingPage.jsx',
    componentName: 'LandingPage',
    output: 'index.html',
    title: 'ChurchOpsHub — Run Your Church on One Platform',
    description: "Inventory, maintenance, scheduling, accountability, people access, tasks, and job posts — all integrated. Free inventory hub forever; paid hubs for the rest. 90-day free trial of all paid hubs.",
  },
  {
    url: '/help',
    modulePath: '/src/pages/HelpPage.jsx',
    componentName: 'HelpPage',
    output: 'help/index.html',
    title: 'Help Center — ChurchOpsHub',
    description: "Answers to common questions about ChurchOpsHub — inventory, hubs, member roles, billing, and more.",
  },
  {
    url: '/terms',
    modulePath: '/src/pages/TermsPage.jsx',
    componentName: 'TermsPage',
    output: 'terms/index.html',
    title: 'Terms of Service — ChurchOpsHub',
    description: "Terms of service for ChurchOpsHub, the church operations platform.",
  },
  {
    url: '/privacy',
    modulePath: '/src/pages/PrivacyPage.jsx',
    componentName: 'PrivacyPage',
    output: 'privacy/index.html',
    title: 'Privacy Policy — ChurchOpsHub',
    description: "Privacy policy for ChurchOpsHub, the church operations platform.",
  },
  {
    url: '/sms-program',
    modulePath: '/src/pages/PublicSMSProgramPage.jsx',
    componentName: 'PublicSMSProgramPage',
    output: 'sms-program/index.html',
    title: 'SMS Program — ChurchOpsHub',
    description: "Information about the ChurchOpsHub SMS reminder program — opt-in flow, message frequency, opt-out instructions, and consent disclosure.",
  },
];

function escapeHTML(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHTML({ shellHTML, route, renderedHTML }) {
  const canonical = `https://churchopshub.com${route.url}`;

  let html = shellHTML.replace(
    /<title>[^<]*<\/title>/,
    `<title>${escapeHTML(route.title)}</title>
    <meta name="description" content="${escapeHTML(route.description)}" />
    <link rel="canonical" href="${escapeHTML(canonical)}" />
    <meta property="og:title" content="${escapeHTML(route.title)}" />
    <meta property="og:description" content="${escapeHTML(route.description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeHTML(canonical)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHTML(route.title)}" />
    <meta name="twitter:description" content="${escapeHTML(route.description)}" />`
  );

  html = html.replace('<div id="root"></div>', `<div id="root">${renderedHTML}</div>`);
  return html;
}

async function main() {
  if (!fs.existsSync(DIST)) {
    console.error("prerender-static: dist/ does not exist. Run 'vite build' first.");
    process.exit(1);
  }

  const indexPath = path.join(DIST, 'index.html');
  const shellHTML = fs.readFileSync(indexPath, 'utf-8');
  fs.writeFileSync(path.join(DIST, 'app.html'), shellHTML, 'utf-8');

  const vite = await createServer({
    root: ROOT,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'warn',
  });

  let renderedCount = 0;

  try {
    for (const route of ROUTES) {
      try {
        const mod = await vite.ssrLoadModule(route.modulePath);
        const Component = mod[route.componentName] || mod.default;

        if (!Component) {
          console.warn(`prerender-static: skipping ${route.url} — no ${route.componentName} export`);
          continue;
        }

        const helmetContext = {};
        const renderedHTML = renderToString(
          React.createElement(HelmetProvider, { context: helmetContext },
            React.createElement(Component)
          )
        );

        const finalHTML = buildHTML({ shellHTML, route, renderedHTML });
        const outputPath = path.join(DIST, route.output);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, finalHTML, 'utf-8');
        renderedCount++;
      } catch (err) {
        console.error(`prerender-static: failed to render ${route.url}:`, err.message);
      }
    }

    console.log(`prerender-static: wrote ${renderedCount} static pages → dist/`);
    console.log(`prerender-static: SPA shell preserved at dist/app.html (vercel.json catch-all → /app.html)`);
  } finally {
    await vite.close();
  }
}

main().catch(err => {
  console.error('prerender-static failed:', err);
  process.exit(1);
});

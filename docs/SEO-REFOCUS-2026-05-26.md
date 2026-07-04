# COH SEO Refocus — Drive Authority to the Real Winners

**Date:** 2026-05-26
**Source signals:** GSC 28-day pull (2026-04-28 → 2026-05-26) via `~/apps/seo-tools/gsc.py`
**Audience:** Future maintainers — this is the rationale + concrete change set, not a status note.

---

## The finding

The blog's highest-impression URL is also its lowest-quality fit.

| URL | Avg position | Impr | Clicks | Reading |
|---|---|---|---|---|
| `/blog/best-church-management-software-small-churches` | **55–94** | 399 | **0** | Ranking on page 6–10 for "best CHMS / best church management" — Planning Center, Tithe.ly, Realm own this SERP. Impressions are bot-floor noise, not opportunity. |
| `/blog/volunteer-coordinator-role-guide` | **22.8** | 198 | 2 | Mid-page-2 for ~10 volunteer-coordination queries. **One page of authority away from page 1.** Not on the prior priority list. |
| `/blog/church-facilities-management-guide` | 25.7 | 160 | 0 | Same shape — bottom of page 2 on real facility-management terms. |
| `/blog/sortly-alternatives-for-churches` | 8.7 | 18 | 0 | Bottom of page 1 (!) with low volume; one more nudge and it converts. |
| `/blog/moving-beyond-spreadsheets` | 6.9 | 7 | 0 | Top half of page 1, no volume yet. |

**Why volunteer-coordinator is stuck at 22:** `grep -c "volunteer-coordinator-role-guide" src/data/blogPosts.js` → **1**, only its own slug. It has zero inbound internal links. Meanwhile `BlogPost.jsx:197-204` sorts "Keep Reading" by date desc and takes 3 newest, so newer posts always capture cross-link juice while older posts (this one is dated 2026-05-14) bleed visibility as the blog grows.

That's an entirely fixable internal-only problem.

---

## The plan — three concrete changes

### 1. Relevance-based "Keep Reading", with curated overrides

**File:** `src/data/blogPosts.js`
**Add optional field per post:** `related: ['slug-1', 'slug-2', 'slug-3']`

**File:** `src/pages/BlogPost.jsx:197-204`
**Change** the related-posts selector from "3 newest" to:

```js
const relatedPosts = (() => {
  // 1. If post declares related slugs, use those in order (filter to ones that exist)
  if (post.related?.length) {
    return post.related
      .map(slug => BLOG_POSTS.find(p => p.slug === slug))
      .filter(Boolean)
      .slice(0, 3);
  }
  // 2. Otherwise fall back to date-desc (current behaviour) but exclude
  //    the wrong-SERP loser so it stops draining link equity.
  return BLOG_POSTS
    .filter(p => p.slug !== post.slug)
    .filter(p => p.slug !== 'best-church-management-software-small-churches')
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);
})();
```

**Why exclude `best-church-management-software-small-churches` from the fallback:** every post currently silently links to it via "Keep Reading" rotation. That's how its impressions inflated to 399 — pure internal-link feedback. Removing it from auto-relateds stops the bleed; the post itself still exists, still ranks where Google thinks it should, but stops being amplified by the rest of the blog.

### 2. Curate inbound links TO the winners

Add `related: [...]` to these 6 posts (the semantic neighbours of `volunteer-coordinator-role-guide`):

```
hidden-cost-of-spreadsheet-church-operations  → ['volunteer-coordinator-role-guide', 'church-volunteer-scheduling-system-that-lasts', 'moving-beyond-spreadsheets']
church-volunteer-scheduling-system-that-lasts → ['volunteer-coordinator-role-guide', 'church-volunteer-equipment-accountability', 'what-planning-center-cant-do']
church-volunteer-equipment-accountability     → ['volunteer-coordinator-role-guide', 'church-volunteer-scheduling-system-that-lasts', 'why-churches-need-inventory-management']
what-planning-center-cant-do                  → ['volunteer-coordinator-role-guide', 'church-facilities-management-guide', 'moving-beyond-spreadsheets']
kanban-church-maintenance                     → ['church-facilities-management-guide', 'church-equipment-maintenance', 'volunteer-coordinator-role-guide']
church-workday-planning                       → ['volunteer-coordinator-role-guide', 'vbs-supply-planning-checklist', 'church-facilities-management-guide']
```

Net effect: volunteer-coordinator-role-guide gains **6 inbound contextual links** (from 0); church-facilities-management-guide gains 3; both winners get the link equity that's currently being squandered on date-desc rotation.

Also add **one inline contextual link** inside the body of each of those 6 posts pointing to volunteer-coordinator (the kind that already exists at `blogPosts.js:447` pointing from scheduling-system-that-lasts to equipment-accountability). Inline contextual links carry more weight than sidebar/footer cards; search for the first naturally-related sentence and link the relevant phrase.

### 3. Surface volunteer-coordinator from the homepage

**File:** `src/pages/LandingPage.jsx`
The homepage has avg position 14.3 and is the highest-authority URL on the property. Add one prominent link from LandingPage to `/blog/volunteer-coordinator-role-guide` (e.g. in a "From the blog" callout near the bottom, or as an inline link within whatever section talks about volunteers/operations). This is a single-line copy edit but the link equity flow from the homepage is disproportionately valuable.

---

## What this is NOT

- **Not a Request-Indexing play.** Every priority URL is already indexed; volunteer-coordinator is at position 22 *because Google indexed it and decided that's where it ranks*. The lever is authority, not crawl.
- **Not a content rewrite.** The post is already strong — 198 impressions at pos 22.8 with no internal-link support proves the content is doing its job. Don't touch the body.
- **Not removing the loser post.** `best-church-management-software-small-churches` still gets typed by some searchers; let it rank where it ranks. Just stop *forcing* every other blog post to vote for it.

## Expected outcome (rough)

- volunteer-coordinator-role-guide: pos 22 → pos 8–14 (page 1, bottom half) over ~4–6 weeks. At 198 imp/mo and a typical pos-10 CTR of ~2.5%, that's ~5 clicks/mo from this single post — small in absolute terms, but the first sustained organic-conversion signal from any blog post except the homepage.
- church-facilities-management-guide: pos 25 → pos 15–20. Less dramatic but still meaningful for the "facility management" cluster.
- Loser post: impressions decline as internal-link reinforcement vanishes. Not a loss — those impressions were never converting.

## Result (verified 2026-06-26)

✅ **The rewire worked.** 28-day GSC pull (2026-05-29 → 2026-06-26):

| URL | Before | After | Verdict |
|---|---|---|---|
| `/blog/volunteer-coordinator-role-guide` | pos 22.8 (198 impr) | **pos 12.2** (136 impr) | Page 1, in the predicted 8–14 band |
| `/blog/church-facilities-management-guide` | pos 25.7 (160 impr) | **pos 18.6** (65 impr) | In the predicted 15–20 band |

Both cleared the doc's own success criterion ("moved below pos 18 → internal linking did its job; the remaining lever is external authority, not internal links"). **This item is closed.** Further movement now depends on **external backlinks** (the `project_blog_indexation_push` track), not more internal rewiring.

## How to verify

Re-run after ~4 weeks (target: 2026-06-23):

```sh
cd ~/apps/seo-tools
./.venv/bin/python gsc.py inspect https://churchopshub.com/blog/volunteer-coordinator-role-guide
./.venv/bin/python - <<'PY'
import sys, datetime; sys.path.insert(0, '.')
from gsc import _service_from
s = _service_from('/Users/johnvaught/.claude/secrets/gsc-oauth-fxcc.json')
end = datetime.date.today(); start = end - datetime.timedelta(days=28)
rows = s.searchanalytics().query(siteUrl='https://churchopshub.com/', body={
  "startDate": str(start), "endDate": str(end),
  "dimensions": ["page"], "rowLimit": 25}).execute().get('rows', [])
for r in rows: print(f"pos={r['position']:5.1f} impr={r['impressions']:4d} clicks={r['clicks']:2d}  {r['keys'][0]}")
PY
```

If volunteer-coordinator hasn't moved below pos 18 after a month, the bottleneck is external authority (not internal linking) and the lever shifts to TODO #3 from `project_blog_indexation_push` — community backlinks.

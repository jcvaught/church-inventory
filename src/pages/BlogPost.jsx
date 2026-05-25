import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { B, f1, f2, btnP, btnS } from '../components/brand/tokens.js';
import { FullLogo } from '../components/brand/Logo.jsx';
import { SEO } from '../components/SEO.jsx';
import { BLOG_POSTS } from '../data/blogPosts.js';

function formatDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

const mdStyles = {
  h2: { fontFamily: f1, fontSize: 22, fontWeight: 700, color: B.navy, margin: '36px 0 14px', lineHeight: 1.3 },
  h3: { fontFamily: f1, fontSize: 17, fontWeight: 700, color: B.navy, margin: '28px 0 10px', lineHeight: 1.4 },
  subHeader: { fontSize: 16, fontFamily: f1, fontWeight: 700, color: B.navy, margin: '22px 0 8px', lineHeight: 1.5 },
  p: { fontSize: 16, color: B.textMid, margin: '0 0 18px', lineHeight: 1.75, wordBreak: 'break-word' },
  a: { color: B.teal, textDecoration: 'underline', textUnderlineOffset: 2, textDecorationThickness: 1 },
  ul: { fontSize: 16, color: B.textMid, margin: '0 0 18px', paddingLeft: 24, lineHeight: 1.75 },
  ol: { fontSize: 16, color: B.textMid, margin: '0 0 18px', paddingLeft: 24, lineHeight: 1.75 },
  li: { margin: '0 0 8px' },
  strong: { fontWeight: 700, color: B.navy },
  em: { fontStyle: 'italic' },
  blockquote: { borderLeft: `3px solid ${B.teal}`, margin: '22px 0', padding: '4px 0 4px 20px', fontStyle: 'italic', color: B.textMid, fontSize: 17, lineHeight: 1.7 },
  code: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 14, background: B.sand, padding: '2px 6px', borderRadius: 4, color: B.navy },
  pre: { background: B.navy, color: B.cream, padding: 16, borderRadius: 8, overflowX: 'auto', fontSize: 14, lineHeight: 1.6, margin: '20px 0' },
  hr: { border: 'none', borderTop: `1px solid ${B.sand}`, margin: '32px 0' },
};

const mdComponents = {
  h2: (props) => <h2 style={mdStyles.h2} {...props} />,
  h3: (props) => <h3 style={mdStyles.h3} {...props} />,
  p: ({ node, ...props }) => {
    const isStrongOnly = node?.children?.length === 1 && node.children[0]?.tagName === 'strong';
    return <p style={isStrongOnly ? mdStyles.subHeader : mdStyles.p} {...props} />;
  },
  a: ({ href, ...props }) => {
    const isExternal = href?.startsWith('http://') || href?.startsWith('https://');
    return <a href={href} style={mdStyles.a} {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})} {...props} />;
  },
  ul: (props) => <ul style={mdStyles.ul} {...props} />,
  ol: (props) => <ol style={mdStyles.ol} {...props} />,
  li: (props) => <li style={mdStyles.li} {...props} />,
  strong: (props) => <strong style={mdStyles.strong} {...props} />,
  em: (props) => <em style={mdStyles.em} {...props} />,
  blockquote: (props) => <blockquote style={mdStyles.blockquote} {...props} />,
  code: ({ inline, ...props }) => inline === false
    ? <pre style={mdStyles.pre}><code {...props} /></pre>
    : <code style={mdStyles.code} {...props} />,
  hr: () => <hr style={mdStyles.hr} />,
};

export function BlogPost({ slug, onGetStarted }) {
  const [w, setW] = useState(window.innerWidth);
  const post = BLOG_POSTS.find(p => p.slug === slug);

  useEffect(() => {
    let t;
    const handler = () => { clearTimeout(t); t = setTimeout(() => setW(window.innerWidth), 80); };
    window.addEventListener('resize', handler);
    return () => { window.removeEventListener('resize', handler); clearTimeout(t); };
  }, []);

  const mob = w < 768;

  if (!post) {
    return (
      <div style={{ fontFamily: f2, color: B.textDark, background: B.cream, minHeight: '100vh' }}>
        <SEO title="Post Not Found — ChurchOpsHub" description="The blog post you were looking for could not be found." />
        <nav style={{ background: B.navy, padding: '14px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ textDecoration: 'none' }}><FullLogo size={30} light /></a>
        </nav>
        <div style={{ maxWidth: 720, margin: '80px auto', padding: '0 24px', textAlign: 'center' }}>
          <h1 style={{ fontFamily: f1, fontSize: 32, color: B.navy, marginBottom: 16 }}>Post Not Found</h1>
          <p style={{ fontSize: 16, color: B.textMid, marginBottom: 32 }}>The article you're looking for doesn't exist.</p>
          <a href="/blog" style={{ ...btnS, textDecoration: 'none', display: 'inline-block' }}>← Back to Blog</a>
        </div>
      </div>
    );
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    articleBody: post.content,
    datePublished: post.date,
    author: { '@type': 'Organization', name: 'ChurchOpsHub' },
    publisher: { '@type': 'Organization', name: 'ChurchOpsHub', url: 'https://churchopshub.com' },
    url: `https://churchopshub.com/blog/${post.slug}`,
    keywords: post.keywords,
  };

  return (
    <div style={{ fontFamily: f2, color: B.textDark, background: B.cream, minHeight: '100vh' }}>
      <SEO
        title={`${post.title} — ChurchOpsHub`}
        description={post.description}
        canonical={`/blog/${post.slug}`}
        ogType="article"
        jsonLd={jsonLd}
      />

      {/* NAV */}
      <nav style={{
        background: B.navy, padding: mob ? '14px 20px' : '14px 40px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100,
        boxShadow: '0 1px 0 rgba(255,255,255,0.06)',
      }}>
        <a href="/" style={{ textDecoration: 'none' }}>
          <FullLogo size={30} light />
        </a>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {!mob && (
            <a href="/blog" style={{ color: 'rgba(255,255,255,0.6)', fontFamily: f1, fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
              Blog
            </a>
          )}
          <button
            onClick={() => onGetStarted('login')}
            style={{ ...btnS, padding: '8px 16px', fontSize: 13, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.8)' }}
          >
            Sign In
          </button>
          {!mob && (
            <button
              onClick={() => onGetStarted('register')}
              style={{ ...btnP, padding: '8px 16px', fontSize: 13 }}
            >
              Get Started Free
            </button>
          )}
        </div>
      </nav>

      {/* ARTICLE */}
      <main style={{ maxWidth: 720, margin: '0 auto', padding: mob ? '48px 24px 80px' : '64px 40px 96px' }}>

        {/* Back link */}
        <a href="/blog" style={{
          fontFamily: f1, fontSize: 13, fontWeight: 600, color: B.teal,
          textDecoration: 'none', display: 'inline-block', marginBottom: 32,
        }}>
          ← Back to Blog
        </a>

        {/* Post meta */}
        <div style={{ fontSize: 13, color: B.textLight, fontFamily: f1, marginBottom: 16 }}>
          {formatDate(post.date)}
        </div>

        {/* Title */}
        <h1 style={{
          fontFamily: f1, fontSize: mob ? 28 : 40, fontWeight: 800,
          color: B.navy, margin: '0 0 32px', lineHeight: 1.15, letterSpacing: -0.5,
        }}>
          {post.title}
        </h1>

        {/* Divider */}
        <div style={{ height: 1, background: B.sand, marginBottom: 40 }} />

        {/* Content */}
        <div>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {post.content}
          </ReactMarkdown>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: B.sand, margin: '48px 0 40px' }} />

        {/* CTA */}
        <div style={{
          background: B.navy, borderRadius: 20, padding: mob ? '32px 24px' : '40px 40px',
          textAlign: 'center',
        }}>
          <h2 style={{
            fontFamily: f1, fontSize: mob ? 22 : 28, fontWeight: 800,
            color: '#fff', margin: '0 0 12px', lineHeight: 1.2,
          }}>
            Start tracking your church's inventory today
          </h2>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.65)', margin: '0 0 28px', lineHeight: 1.6 }}>
            Free forever. No credit card required. Set up in under an hour.
          </p>
          <button
            onClick={() => onGetStarted('register')}
            style={{ ...btnP, padding: '13px 32px', fontSize: 15 }}
          >
            Get Started Free
          </button>
        </div>

        {/* Related posts — 3 most recent */}
        {(() => {
          const relatedPosts = BLOG_POSTS
            .filter(p => p.slug !== post.slug)
            .slice()
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 3);
          return relatedPosts.length > 0 && (
          <div style={{ marginTop: 56 }}>
            <h3 style={{ fontFamily: f1, fontSize: 18, fontWeight: 700, color: B.navy, marginBottom: 20 }}>
              Keep Reading
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {relatedPosts.map(related => (
                <a key={related.slug} href={`/blog/${related.slug}`} style={{ textDecoration: 'none' }}>
                  <div style={{
                    background: B.white, borderRadius: 12, padding: '20px 24px',
                    border: `1px solid ${B.sand}`,
                  }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = B.teal}
                    onMouseLeave={e => e.currentTarget.style.borderColor = B.sand}
                  >
                    <div style={{ fontFamily: f1, fontWeight: 600, fontSize: 15, color: B.navy, marginBottom: 6 }}>
                      {related.title}
                    </div>
                    <div style={{ fontSize: 13, color: B.textMid, lineHeight: 1.55 }}>{related.description}</div>
                  </div>
                </a>
              ))}
            </div>
          </div>
          );
        })()}
      </main>

      {/* FOOTER */}
      <footer style={{ background: B.navy, padding: mob ? '32px 24px' : '40px 40px' }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          display: 'flex', flexDirection: mob ? 'column' : 'row',
          justifyContent: 'space-between', alignItems: mob ? 'flex-start' : 'center',
          gap: 20,
        }}>
          <a href="/" style={{ textDecoration: 'none' }}>
            <FullLogo size={26} light />
          </a>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
            <a href="/" style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, textDecoration: 'none', fontFamily: f1 }}>Home</a>
            <a href="/blog" style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, textDecoration: 'none', fontFamily: f1 }}>Blog</a>
            <a href="/?help" style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, textDecoration: 'none', fontFamily: f1 }}>Help</a>
            <a href="mailto:churchopshub@gmail.com" style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, textDecoration: 'none', fontFamily: f1 }}>Contact</a>
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', fontFamily: f1 }}>
            © {new Date().getFullYear()} ChurchOpsHub
          </div>
        </div>
        <div style={{ maxWidth: 1100, margin: '20px auto 0', paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 13, color: 'rgba(255,255,255,0.40)', fontFamily: f1, textAlign: mob ? 'left' : 'center' }}>
          More from our network:{' '}
          <a href="https://courtclimber.com/blog" rel="noopener" style={{ color: 'rgba(255,255,255,0.6)' }}>Pickleball club software</a>{' · '}
          <a href="https://masteryhelp.com/blog" rel="noopener" style={{ color: 'rgba(255,255,255,0.6)' }}>Learn Biblical Greek &amp; Hebrew</a>{' · '}
          <a href="https://repcrew.fit/blog" rel="noopener" style={{ color: 'rgba(255,255,255,0.6)' }}>Workout accountability</a>
        </div>
      </footer>
    </div>
  );
}

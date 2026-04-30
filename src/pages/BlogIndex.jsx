import { useState, useEffect } from 'react';
import { B, f1, f2, btnP, btnS } from '../components/brand/tokens.js';
import { FullLogo } from '../components/brand/Logo.jsx';
import { SEO } from '../components/SEO.jsx';
import { BLOG_POSTS } from '../data/blogPosts.js';

function formatDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function BlogIndex({ onGetStarted }) {
  const [w, setW] = useState(window.innerWidth);

  useEffect(() => {
    let t;
    const handler = () => { clearTimeout(t); t = setTimeout(() => setW(window.innerWidth), 80); };
    window.addEventListener('resize', handler);
    return () => { window.removeEventListener('resize', handler); clearTimeout(t); };
  }, []);

  const mob = w < 768;

  return (
    <div style={{ fontFamily: f2, color: B.textDark, background: B.cream, minHeight: '100vh' }}>
      <SEO
        title="Blog — ChurchOpsHub"
        description="Resources, best practices, and guides for running your church operations."
        canonical="/blog"
        ogType="website"
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
            <a href="/?help" style={{ color: 'rgba(255,255,255,0.6)', fontFamily: f1, fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
              Help
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

      {/* HEADER */}
      <section style={{
        background: `linear-gradient(150deg, ${B.navy} 0%, #1e3258 100%)`,
        padding: mob ? '56px 24px 64px' : '80px 40px 88px',
        textAlign: 'center',
      }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{
            display: 'inline-block', background: 'rgba(42,125,110,0.2)',
            border: '1px solid rgba(42,125,110,0.4)', borderRadius: 100,
            padding: '5px 18px', fontSize: 13, color: '#5ecfbb',
            fontFamily: f1, marginBottom: 24, letterSpacing: 0.5,
          }}>
            Resources
          </div>
          <h1 style={{
            fontFamily: f1, fontSize: mob ? 34 : 48, fontWeight: 800,
            color: '#fff', margin: '0 0 16px', lineHeight: 1.1, letterSpacing: -1,
          }}>
            Church Inventory Blog
          </h1>
          <p style={{
            fontSize: mob ? 15 : 17, color: 'rgba(255,255,255,0.65)',
            margin: 0, lineHeight: 1.7,
          }}>
            Practical guides and best practices for managing your church's physical assets.
          </p>
        </div>
      </section>

      {/* POSTS */}
      <section style={{ padding: mob ? '48px 24px 80px' : '64px 40px 96px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>
          {BLOG_POSTS.map(post => (
            <a
              key={post.slug}
              href={`/blog/${post.slug}`}
              style={{ textDecoration: 'none' }}
            >
              <article style={{
                background: B.white, borderRadius: 16, padding: mob ? '28px 24px' : '36px 40px',
                border: `1px solid ${B.sand}`,
                transition: 'box-shadow 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.08)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
              >
                <div style={{ fontSize: 13, color: B.textLight, fontFamily: f1, marginBottom: 12 }}>
                  {formatDate(post.date)}
                </div>
                <h2 style={{
                  fontFamily: f1, fontSize: mob ? 20 : 24, fontWeight: 700,
                  color: B.navy, margin: '0 0 12px', lineHeight: 1.25,
                }}>
                  {post.title}
                </h2>
                <p style={{
                  fontSize: 15, color: B.textMid, margin: '0 0 20px', lineHeight: 1.65,
                }}>
                  {post.description}
                </p>
                <span style={{
                  fontFamily: f1, fontSize: 14, fontWeight: 600, color: B.teal,
                }}>
                  Read article →
                </span>
              </article>
            </a>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{
        background: `linear-gradient(135deg, ${B.teal} 0%, ${B.tealLight} 100%)`,
        padding: mob ? '56px 24px' : '72px 40px', textAlign: 'center',
      }}>
        <div style={{ maxWidth: 500, margin: '0 auto' }}>
          <h2 style={{ fontFamily: f1, fontSize: mob ? 28 : 36, fontWeight: 800, color: '#fff', margin: '0 0 14px', lineHeight: 1.2 }}>
            Ready to get organized?
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.8)', margin: '0 0 32px', lineHeight: 1.6 }}>
            ChurchOpsHub is free to start — no credit card required.
          </p>
          <button
            onClick={() => onGetStarted('register')}
            style={{ ...btnP, padding: '14px 36px', fontSize: 16, background: B.white, color: B.teal }}
          >
            Get Started Free
          </button>
        </div>
      </section>

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
      </footer>
    </div>
  );
}

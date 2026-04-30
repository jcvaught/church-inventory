import { Helmet } from 'react-helmet-async';

const BASE_URL = 'https://churchopshub.com';
const DEFAULT_OG_IMAGE = `${BASE_URL}/og-image.png`;

export function SEO({ title, description, canonical, ogImage, ogType = 'website', jsonLd }) {
  const fullTitle = title || 'ChurchOpsHub — The Operations Platform for Churches';
  const fullDescription = description || 'ChurchOpsHub is the operations platform built for churches — track inventory, supplies, reservations, maintenance, and more.';
  const canonicalUrl = canonical ? `${BASE_URL}${canonical}` : BASE_URL;
  const image = ogImage || DEFAULT_OG_IMAGE;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={fullDescription} />
      <link rel="canonical" href={canonicalUrl} />

      {/* Open Graph */}
      <meta property="og:type" content={ogType} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={fullDescription} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={image} />
      <meta property="og:site_name" content="ChurchOpsHub" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={fullDescription} />
      <meta name="twitter:image" content={image} />

      {/* JSON-LD structured data */}
      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      )}
    </Helmet>
  );
}

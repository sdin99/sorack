// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
  site: 'https://sorack.com',
  integrations: [
    starlight({
      title: 'sorack',
      description:
        'Self-hosted homelab control plane — topology, per-axis monitoring and node-linked runbooks.',
      customCss: ['./src/styles/sorack.css'],
      favicon: '/favicon.svg',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/sdin99/sorack' },
      ],
      // Inter + JetBrains Mono, matching the app UI.
      head: [
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' } },
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: true } },
        {
          tag: 'link',
          attrs: {
            rel: 'stylesheet',
            href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap',
          },
        },
      ],
      // Docs live under /docs/* (content/docs/docs/**). The site root /
      // is a custom landing page (src/pages/index.astro).
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'Quickstart', slug: 'docs' },
            { label: 'Concepts', slug: 'docs/concepts' },
          ],
        },
        {
          label: 'Adapters',
          items: [{ label: 'Probes & adapters', slug: 'docs/adapters' }],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Configuration', slug: 'docs/configuration' },
            { label: 'Troubleshooting', slug: 'docs/troubleshooting' },
          ],
        },
      ],
    }),
  ],
});

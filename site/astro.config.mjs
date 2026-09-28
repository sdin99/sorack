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
      logo: { src: './src/assets/sorack-mark.svg', alt: 'sorack' },
      customCss: ['./src/styles/sorack.css'],
      favicon: '/favicon.svg',
      // English stays at the root (`/docs/...`), Korean sits under `/ko/`.
      // ‼ `root` is load-bearing. The other way to write this is
      // `defaultLocale: 'en'` with an `en` entry, which moves English to
      // `/en/docs/...` and breaks every link that already exists — the README,
      // the GitHub issues, anything anyone bookmarked. A translation should
      // not be able to move the original.
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        ko: { label: '한국어', lang: 'ko' },
      },
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
          label: 'Deploy',
          items: [{ label: 'Kubernetes', slug: 'docs/kubernetes' }],
        },
        {
          label: 'Adapters',
          items: [{ label: 'Probes & adapters', slug: 'docs/adapters' }],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Node types & meta', slug: 'docs/nodes' },
            { label: 'Configuration', slug: 'docs/configuration' },
            { label: 'API keys', slug: 'docs/api' },
            { label: 'Troubleshooting', slug: 'docs/troubleshooting' },
          ],
        },
      ],
    }),
  ],
});

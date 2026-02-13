import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Kontract',
  description: 'Serverless full-stack TypeScript framework with minimal database privileges',
  base: '/',
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/overview' },
      { text: 'Quickstart', link: '/guide/quickstart' },
      { text: 'Architecture', link: '/architecture/runtime' },
      { text: 'Security', link: '/architecture/security' },
      { text: 'Developer Docs', link: '/dev/' },
      { text: 'User Docs', link: '/user/' }
    ],
    sidebar: {
      '/guide/': [
        { text: 'Overview', link: '/guide/overview' },
        { text: 'Quickstart', link: '/guide/quickstart' },
        { text: 'Authentication', link: '/guide/authentication' },
        { text: 'Cookbook', link: '/guide/cookbook' },
        { text: 'Lazy Loading', link: '/guide/lazy-loading' },
        { text: 'Deployment', link: '/guide/deployment' }
      ],
      '/architecture/': [
        { text: 'Runtime', link: '/architecture/runtime' },
        { text: 'Compiler', link: '/architecture/compiler' },
        { text: 'Storage & Migrations', link: '/architecture/storage' },
        { text: 'Security', link: '/architecture/security' }
      ],
      '/dev/': [
        { text: 'Developer Docs', link: '/dev/' },
        { text: 'Installation', link: '/dev/installation' },
        { text: 'Configuration', link: '/dev/configuration' },
        { text: 'API Reference', link: '/dev/api' },
        { text: 'Roadmap', link: '/dev/roadmap' },
        { text: 'Contributing', link: '/dev/contributing' }
      ],
      '/user/': [
        { text: 'User Docs', link: '/user/' },
        { text: 'Setup', link: '/user/setup' },
        { text: 'Features', link: '/user/features' },
        { text: 'Examples', link: '/user/examples' },
        { text: 'Troubleshooting', link: '/user/troubleshooting' }
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/rand0mdevel0per/kontract' }
    ]
  }
});

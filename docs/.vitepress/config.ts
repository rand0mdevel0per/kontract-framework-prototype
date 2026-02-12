import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Konstract',
  description: '事件驱动全栈 TypeScript 框架原型',
  base: '/',
  themeConfig: {
    nav: [
      { text: '指南', link: '/guide/overview' },
      { text: '快速开始', link: '/guide/quickstart' },
      { text: '架构', link: '/architecture/runtime' }
    ],
    sidebar: {
      '/guide/': [
        { text: '概览', link: '/guide/overview' },
        { text: '快速开始', link: '/guide/quickstart' }
      ],
      '/architecture/': [
        { text: '运行时', link: '/architecture/runtime' },
        { text: '编译器', link: '/architecture/compiler' },
        { text: '存储与迁移', link: '/architecture/storage' }
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/rand0mdevel0per/konstract' }
    ]
  }
});

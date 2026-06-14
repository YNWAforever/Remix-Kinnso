import type { Messages } from './en'

const messages: Messages = {
  brand: 'Kinnso',
  categories: { destinations: '目的地', dining: '美食', shopping: '购物' },
  breadcrumb: { home: '首页', articles: '文章' },
  article: { youMayLike: '你可能喜欢', faqTitle: '常见问题', tableOfContents: '本文目录', by: '作者' },
  listing: { searchPlaceholder: '搜索文章', filterRegion: '地区', filterTag: '标签', noResults: '找不到文章。', resultsCount: '篇文章' },
  pagination: { prev: '上一页', next: '下一页', page: '第' },
  auth: {
    signIn: '登录',
    signUp: '注册',
    signOut: '退出登录',
    email: '电子邮件',
    password: '密码',
    emailSent: '请查看您的电子邮件',
    emailSentDesc: '我们已向您发送确认链接，点击后即可激活账户。',
    alreadyHaveAccount: '已有账户？',
    noAccount: '还没有账户？',
    errorInvalidCredentials: '电子邮件或密码错误。',
    errorEmailTaken: '此电子邮件已有账户。',
    errorGeneric: '发生错误，请再试一次。',
    creatorDashboard: '创作者主页',
    onboardingPlaceholder: '新手引导将在方案 4 推出。',
  },
}
export default messages

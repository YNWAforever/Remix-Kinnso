import type { Messages } from './en'

const messages: Messages = {
  brand: 'Kinnso',
  categories: { destinations: '目的地', dining: '美食', shopping: '購物' },
  breadcrumb: { home: '首頁', articles: '文章' },
  article: { youMayLike: '你可能喜歡', faqTitle: '常見問題', tableOfContents: '本文目錄', by: '作者' },
  listing: { searchPlaceholder: '搜尋文章', filterRegion: '地區', filterTag: '標籤', noResults: '找不到文章。', resultsCount: '篇文章' },
  pagination: { prev: '上一頁', next: '下一頁', page: '第' },
  auth: {
    signIn: '登入',
    signUp: '註冊',
    signOut: '登出',
    email: '電子郵件',
    password: '密碼',
    emailSent: '請查看您的電子郵件',
    emailSentDesc: '我們已向您發送確認連結，點擊後即可啟用帳戶。',
    alreadyHaveAccount: '已有帳戶？',
    noAccount: '還沒有帳戶？',
    errorInvalidCredentials: '電子郵件或密碼錯誤。',
    errorEmailTaken: '此電子郵件已有帳戶。',
    errorGeneric: '發生錯誤，請再試一次。',
    creatorDashboard: '創作者主頁',
    onboardingPlaceholder: '入門精靈將於方案 4 推出。',
  },
}
export default messages

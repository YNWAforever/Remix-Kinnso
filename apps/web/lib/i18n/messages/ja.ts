import type { Messages } from './en'

const messages: Messages = {
  brand: 'Kinnso',
  categories: { destinations: '旅行先', dining: 'グルメ', shopping: 'ショッピング' },
  breadcrumb: { home: 'ホーム', articles: '記事' },
  article: { youMayLike: 'おすすめ記事', faqTitle: 'よくある質問', tableOfContents: '目次', by: '著者' },
  listing: { searchPlaceholder: '記事を検索', filterRegion: '地域', filterTag: 'タグ', noResults: '記事が見つかりません。', resultsCount: '件' },
  pagination: { prev: '前へ', next: '次へ', page: 'ページ' },
  auth: {
    signIn: 'ログイン',
    signUp: '新規登録',
    signOut: 'ログアウト',
    email: 'メールアドレス',
    password: 'パスワード',
    emailSent: 'メールをご確認ください',
    emailSentDesc: '確認リンクを送信しました。クリックしてアカウントを有効化してください。',
    alreadyHaveAccount: 'アカウントをお持ちですか？',
    noAccount: 'アカウントをお持ちでないですか？',
    errorInvalidCredentials: 'メールアドレスまたはパスワードが間違っています。',
    errorEmailTaken: 'このメールアドレスはすでに使用されています。',
    errorGeneric: 'エラーが発生しました。もう一度お試しください。',
    creatorDashboard: 'クリエイタートップ',
    onboardingPlaceholder: 'オンボーディングウィザードはプラン4で公開予定です。',
  },
}
export default messages

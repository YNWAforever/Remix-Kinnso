import type { Messages } from './en'

const messages: Messages = {
  brand: 'Kinnso',
  categories: { destinations: '여행지', dining: '다이닝', shopping: '쇼핑' },
  breadcrumb: { home: '홈', articles: '아티클' },
  article: { youMayLike: '추천 콘텐츠', faqTitle: '자주 묻는 질문', tableOfContents: '목차', by: '작성자' },
  listing: { searchPlaceholder: '아티클 검색', filterRegion: '지역', filterTag: '태그', noResults: '검색 결과가 없습니다.', resultsCount: '개' },
  pagination: { prev: '이전', next: '다음', page: '페이지' },
  auth: {
    signIn: '로그인',
    signUp: '회원가입',
    signOut: '로그아웃',
    email: '이메일 주소',
    password: '비밀번호',
    emailSent: '이메일을 확인해 주세요',
    emailSentDesc: '확인 링크를 보냈습니다. 클릭하여 계정을 활성화하세요.',
    alreadyHaveAccount: '이미 계정이 있으신가요?',
    noAccount: '계정이 없으신가요?',
    errorInvalidCredentials: '이메일 또는 비밀번호가 올바르지 않습니다.',
    errorEmailTaken: '이미 사용 중인 이메일입니다.',
    errorGeneric: '오류가 발생했습니다. 다시 시도해 주세요.',
    creatorDashboard: '크리에이터 대시보드',
    onboardingPlaceholder: '온보딩 마법사는 플랜 4에서 제공될 예정입니다.',
  },
}
export default messages

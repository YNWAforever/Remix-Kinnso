export interface Messages {
  brand: string
  categories: { destinations: string; dining: string; shopping: string }
  breadcrumb: { home: string; articles: string }
  article: { youMayLike: string; faqTitle: string; tableOfContents: string; by: string }
  listing: { searchPlaceholder: string; filterRegion: string; filterTag: string; noResults: string; resultsCount: string }
  pagination: { prev: string; next: string; page: string }
  auth: {
    signIn: string
    signUp: string
    signOut: string
    email: string
    password: string
    emailSent: string
    emailSentDesc: string
    alreadyHaveAccount: string
    noAccount: string
    errorInvalidCredentials: string
    errorEmailTaken: string
    errorGeneric: string
    creatorDashboard: string
    onboardingPlaceholder: string
  }
}

const messages: Messages = {
  brand: 'Kinnso',
  categories: { destinations: 'Destinations', dining: 'Dining', shopping: 'Shopping' },
  breadcrumb: { home: 'Home', articles: 'Articles' },
  article: { youMayLike: 'You may like', faqTitle: 'Frequently asked questions', tableOfContents: 'In this article', by: 'By' },
  listing: { searchPlaceholder: 'Search articles', filterRegion: 'Region', filterTag: 'Tag', noResults: 'No articles found.', resultsCount: 'articles' },
  pagination: { prev: 'Previous', next: 'Next', page: 'Page' },
  auth: {
    signIn: 'Sign in',
    signUp: 'Sign up',
    signOut: 'Sign out',
    email: 'Email address',
    password: 'Password',
    emailSent: 'Check your email',
    emailSentDesc: 'We sent you a confirmation link. Click it to activate your account.',
    alreadyHaveAccount: 'Already have an account?',
    noAccount: 'Don\'t have an account?',
    errorInvalidCredentials: 'Invalid email or password.',
    errorEmailTaken: 'An account with this email already exists.',
    errorGeneric: 'Something went wrong. Please try again.',
    creatorDashboard: 'Creator Dashboard',
    onboardingPlaceholder: 'Onboarding wizard coming in Plan 4.',
  },
}
export default messages

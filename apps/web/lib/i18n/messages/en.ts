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
  onboarding: {
    title: string
    handlesStep: {
      heading: string
      intro: string
      instagram: string
      youtube: string
      threads: string
      placeholder: string
      add: string
      remove: string
      run: string
      errorEmpty: string
      errorFormat: string
      errorLength: string
      errorDuplicate: string
      needOne: string
    }
    progressStep: {
      heading: string
      phaseQueued: string
      phaseFetching: string
      phaseAnalyzing: string
      phaseReady: string
      phaseFailed: string
      statePending: string
      stateOk: string
      stateFailed: string
      retry: string
      rateLimited: string
      reauth: string
      error: string
      continue: string
    }
    signOut: string
  }
  dna: {
    reviewHeading: string
    reviewIntro: string
    thinNotice: string
    bio: string
    niches: string
    contentPillars: string
    tone: string
    topGeos: string
    topLocales: string
    languages: string
    platforms: string
    unverified: string
    listHint: string
    publish: string
    saving: string
    invalid: string
    readBackHeading: string
    readBackIntro: string
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
  onboarding: {
    title: 'Set up your creator profile',
    handlesStep: {
      heading: 'Add your social handles',
      intro: 'Add 1–3 of the accounts below. We scan them to draft your creator DNA.',
      instagram: 'Instagram',
      youtube: 'YouTube',
      threads: 'Threads',
      placeholder: 'handle or profile URL',
      add: 'Add',
      remove: 'Remove',
      run: 'Run scan',
      errorEmpty: 'Enter a handle.',
      errorFormat: 'That handle has invalid characters.',
      errorLength: 'That handle is too long (max 30).',
      errorDuplicate: 'You already added a handle for this platform.',
      needOne: 'Add at least one handle to continue.',
    },
    progressStep: {
      heading: 'Scanning your accounts',
      phaseQueued: 'Queued',
      phaseFetching: 'Fetching your posts',
      phaseAnalyzing: 'Analyzing your content',
      phaseReady: 'Done — your DNA is ready',
      phaseFailed: 'The scan failed',
      statePending: 'Pending',
      stateOk: 'Done',
      stateFailed: 'Failed',
      retry: 'Retry scan',
      rateLimited: "You've scanned too recently. Please try again later.",
      reauth: 'Your session expired. Please sign in again.',
      error: 'Something went wrong starting the scan. Please try again.',
      continue: 'Continue',
    },
    signOut: 'Sign out',
  },
  dna: {
    reviewHeading: 'Review your creator DNA',
    reviewIntro: 'We drafted this from your accounts. Edit anything, then publish.',
    thinNotice: 'We found limited signal. Add more handles or fill these in manually.',
    bio: 'Bio',
    niches: 'Niches',
    contentPillars: 'Content pillars',
    tone: 'Tone',
    topGeos: 'Top regions',
    topLocales: 'Top locales',
    languages: 'Languages',
    platforms: 'Platforms',
    unverified: 'Unverified',
    listHint: 'Comma-separated',
    publish: 'Publish profile',
    saving: 'Publishing…',
    invalid: 'Please fix the highlighted fields before publishing.',
    readBackHeading: 'Your profile is live',
    readBackIntro: 'Here is your published creator DNA.',
  },
}
export default messages

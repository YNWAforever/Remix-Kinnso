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
    emailSentNext: string
    emailSentSignIn: string
    emailSentUseAnother: string
    alreadyHaveAccount: string
    noAccount: string
    errorInvalidCredentials: string
    errorEmailTaken: string
    errorInvalidEmail: string
    errorRateLimited: string
    errorGeneric: string
    creatorDashboard: string
    onboardingPlaceholder: string
  }
  onboarding: {
    title: string
    welcomeStep: {
      heading: string
      intro: string
      pointPublic: string
      pointTime: string
      pointEdit: string
      cta: string
      platforms: string
    }
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
      unconfigured: string
      stepFetchingDesc: string
      stepAnalyzingDesc: string
      stepReadyTitle: string
      stepReadyDesc: string
      timeHint: string
      elapsed: string
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
    enterStudio: string
  }
  studio: {
    introHeading: string
    introSub: string
    instagram: string
    handlePlaceholder: string
    startScan: string
    scanningHeading: string
    stepConnected: string
    stepFetched: string
    stepClassified: string
    stepCities: string
    stepPhotoScan: string
    stepScoreReady: string
    stepMissionsMatched: string
    reportReadyHeading: string
    lastScanned: string
    postsAnalyzed: string
    rescan: string
    rescanIn: string
    lastScannedAgo: string
    avgLikes: string
    avgSaves: string
    er: string
    travel: string
    commission: string
    scoreBreakdownToggle: string
    scoreBreakdownReach: string
    scoreBreakdownEr: string
    scoreBreakdownTravel: string
    scoreBreakdownDiversity: string
    scoreBreakdownRecency: string
    scoreBreakdownReachTip: string
    scoreBreakdownErTip: string
    scoreBreakdownTravelTip: string
    scoreBreakdownDiversityTip: string
    scoreBreakdownRecencyTip: string
    scoreBreakdownPts: string
    scoreBreakdownTotal: string
    engagementOverTime: string
    yourAudience: string
    audienceOther: string
    whatYouCreate: string
    placesCovered: string
    placesCoveredSub: string
    topVenues: string
    bestTravelPosts: string
    rankedByEngagement: string
    knownFor: string
    matchedForYou: string
    reachToUnlock: string
    viewAllMissions: string
    publishProfile: string
    shareDnaCard: string
    shareDialogTitle: string
    shareCopyLink: string
    shareCopied: string
    deltaUnchanged: string
    deltaSinceLastScan: string
    scanHint: string
    // Slice 2 — DNA core panel
    dnaCoreHeading: string
    dnaBio: string
    dnaNiches: string
    dnaPillars: string
    dnaTone: string
    dnaAudienceGeos: string
    dnaLocales: string
    dnaLanguages: string
    dnaPlatforms: string
    // Slice 2 — sample-metrics labelling
    sampleBadge: string
    sampleNote: string
    // Slice 2 — empty state (no published DNA)
    noDnaHeading: string
    noDnaBody: string
    noDnaCta: string
  }
  creatorProfile: {
    metaTitle: string
    metaDescription: string
    notFoundTitle: string
    follow: string
    following: string
    statGuides: string
    statCountries: string
    statCities: string
    statReach90d: string
    statDrivenGmv: string
    engagementBandSummary: string
    notConnected: string
    followers: string
    avgEng: string
    travelPct: string
    destinationsCovered: string
    destinationsCoveredSub: string
    topPlacesCovered: string
    dnaScore6mo: string
    contentMix: string
    topTags: string
    latestGuides: string
    viewAllGuides: string
    recentPosts: string
    tabAll: string
    tabInstagram: string
    tabThreads: string
    tabYoutube: string
    cityPostsHeading: string
    cityPlacesHeading: string
    cityNoPosts: string
    cityFirstVisited: string
    cityLastVisited: string
    cityPosts: string
    cityAvgEng: string
    cityTotalEngagement: string
    brandWorkWith: string
    brandTierLine: string
    brandReachLine: string
    brandSendBrief: string
    brandSaveToList: string
    brandSignInToContact: string
  }
  merchants: {
    heading: string
    sub: string
    yourProfile: string
    searchPlaceholder: string
    filter: string
    tabRecommended: string
    tabSaved: string
    tabWorking: string
    emptyRecommended: string
    emptySaved: string
    emptyWorking: string
    addPrivateNote: string
    statusInProgress: string
    statusDelivered: string
    statusCompleted: string
    matchLabel: string
    reasonCovers: string
    reasonCreator: string
    reasonTier: string
    reasonAudience: string
    cardDna: string
    cardEr: string
    cardGuides: string
    cardReach: string
    cardCountries: string
    viewProfile: string
    sendBrief: string
    save: string
    saved: string
    showDetails: string
    hideDetails: string
    detailTopLocations: string
    detailContentSample: string
    detailEngagementTrend: string
    filterTitle: string
    filterLocation: string
    filterScore: string
    filterMinEr: string
    filterTier: string
    filterCategory: string
    filterAudience: string
    filterPlatforms: string
    filterMinFollowers: string
    filterActivity: string
    followersAny: string
    activity7: string
    activity30: string
    activity90: string
    activityAny: string
    clearAll: string
    applyFilters: string
    close: string
    searchesLeft: string
    invitesLeft: string
    upgradeToGrowth: string
    upgradeBlurb: string
    upgradeCta: string
    lockedFilter: string
    inviteDisabled: string
    resultsCapped: string
  }
  missions: {
    missionQueue: string
    joinMission: string
    applyMission: string
    generatePartnerLink: string
    approve: string
    reject: string
    requestRevision: string
    submitMilestone: string
    participants: string
    pendingApplications: string
    settlement: string
    postHeading: string
    postSub: string
    typeCoupon: string
    typeHybrid: string
    typePaid: string
    title: string
    summary: string
    couponCode: string
    couponUrl: string
    affiliateCommissionRate: string
    kinnsoCommissionRate: string
    creatorCommissionRate: string
    paidFeeAmount: string
    paidFeeCurrency: string
    milestoneTitle: string
    milestoneDescription: string
    saveDraft: string
    publish: string
    openMission: string
    targetedMission: string
    validationError: string
    myMissions: string
    availableMissions: string
    milestoneProgress: string
    myMissionsEmpty: string
    availableEmpty: string
  }
  ops: {
    settlementHeading: string
    settlementSub: string
    markPaid: string
    statusPending: string
    statusPaid: string
  }
  nav: {
    linkCreators: string; linkMerchants: string; linkAgent: string; linkTravelers: string
    linkGuides: string; linkArticles: string; linkFindCreators: string
    ctaApply: string; ctaOpenStudio: string; ctaPending: string; ctaPostMission: string
    signIn: string; language: string; menuToggle: string; skipToContent: string
  }
  footer: {
    tagline: string; colCreators: string; colMerchants: string; colCompany: string
    lApply: string; lStudio: string; lMissions: string; lEarnings: string
    lPostMission: string; lPricing: string; lCaseStudies: string; lContact: string
    lAbout: string; lAgent: string; lPress: string; lLegal: string; rights: string
  }
  home: {
    heroPill: string; heroTitle: string; heroSubtitle: string; applyCta: string
    howHeading: string; howSub: string
    step1Title: string; step1Desc: string; step2Title: string; step2Desc: string
    step3Title: string; step3Desc: string; step4Title: string; step4Desc: string
    merchantWall: string; featuredHeading: string; featuredSub: string; featuredSeeAll: string
    travelersTitle: string; travelersDesc: string; travelersCta: string
    merchantsTitle: string; merchantsDesc: string; merchantsCta: string
  }
  comingSoon: { heading: string; body: string; back: string }
  studioHome: {
    pill: string; heading: string; subtitle: string
    liveBadge: string; soonBadge: string; open: string
    scanTitle: string; scanDesc: string
    missionsTitle: string; missionsDesc: string
    earningsTitle: string; earningsDesc: string
    offersTitle: string; offersDesc: string
    inboxTitle: string; inboxDesc: string
    guidesTitle: string; guidesDesc: string
  }
  studioDashboard: {
    greeting: string
    statusActive: string
    dnaSnapshotTitle: string
    dnaLastScanned: string
    dnaNiches: string
    dnaPillars: string
    viewFullReport: string
    checklistTitle: string
    checklistProgress: string
    itemDnaReadyTitle: string
    itemDnaReadyCta: string
    itemWriteGuideTitle: string
    itemWriteGuideCta: string
    itemConnectTitle: string
    itemConnectGap: string
    itemConnectCta: string
    itemConnectAllDone: string
    itemFreshTitle: string
    itemFreshScanned: string
    itemFreshScannedToday: string
    rescanCta: string
    opportunitiesTitle: string
    opportunitiesEmpty: string
    opportunitiesBrowse: string
    earningsTitle: string
    earningsEmpty: string
    earningsView: string
    quickLinksTitle: string
    addHandleTitle: string
    addHandlePlaceholder: string
    addHandleSave: string
    addHandleCancel: string
    addHandleErrorEmpty: string
    addHandleErrorFormat: string
    addHandleErrorLength: string
    addHandleSaved: string
  }
  studioGuides: {
    listPill: string; listHeading: string; listSubtitle: string
    newButton: string; emptyTitle: string; emptyBody: string
    statusDraft: string; statusPublished: string
    edit: string; delete: string; deleteConfirm: string
    formNewHeading: string; formEditHeading: string
    titleLabel: string; titlePlaceholder: string
    cityLabel: string; cityPlaceholder: string
    coverLabel: string; coverPlaceholder: string; coverPreviewAlt: string
    summaryLabel: string; summaryPlaceholder: string
    saveDraft: string; publish: string; saving: string
    backToGuides: string
    errorTitleRequired: string; errorSummaryRequired: string; errorCityRequired: string
    errorCoverRequired: string; errorCoverInvalid: string; errorGeneric: string
  }
  explore: {
    pill: string; heading: string; subtitle: string
    savesLabel: string; emptyNote: string
  }
  feed: {
    pill: string; heading: string; subtitle: string
    savesLabel: string; empty: string
  }
  creatorsLanding: {
    heroPill: string; heroTitle: string; heroSubtitle: string; applyCta: string
    howHeading: string; howSub: string
    step1Title: string; step1Desc: string
    step2Title: string; step2Desc: string
    step3Title: string; step3Desc: string
    step4Title: string; step4Desc: string
    featuredHeading: string; featuredSub: string
    ctaTitle: string; ctaDesc: string; ctaButton: string
  }
  merchantsLanding: {
    heroPill: string; heroTitle: string; heroSubtitle: string
    postCta: string; browseCta: string
    howHeading: string; howSub: string
    step1Title: string; step1Desc: string
    step2Title: string; step2Desc: string
    step3Title: string; step3Desc: string
    samplesHeading: string; samplesSub: string
    ctaTitle: string; ctaDesc: string; ctaButton: string
  }
  studioOffers: {
    heading: string
    subtitle: string
    empty: string
    join: string
    generateLink: string
    copy: string
    copied: string
    category: string
    commission: string
    viewProgram: string
  }
  studioEarnings: {
    heading: string
    subtitle: string
    paid: string
    pending: string
    empty: string
    colMission: string
    colType: string
    colAmount: string
    colStatus: string
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
    emailSentNext: 'After confirming, Kinnso will take you to creator setup to connect Instagram, YouTube, or Threads.',
    emailSentSignIn: 'Sign in after confirming',
    emailSentUseAnother: 'Use another email',
    alreadyHaveAccount: 'Already have an account?',
    noAccount: 'Don\'t have an account?',
    errorInvalidCredentials: 'Invalid email or password.',
    errorEmailTaken: 'An account with this email already exists.',
    errorInvalidEmail: 'Enter a valid email address.',
    errorRateLimited: 'Too many sign-up attempts. Please wait a minute and try again.',
    errorGeneric: 'Something went wrong. Please try again.',
    creatorDashboard: 'Creator Dashboard',
    onboardingPlaceholder: 'Onboarding wizard coming in Plan 4.',
  },
  onboarding: {
    title: 'Set up your creator profile',
    welcomeStep: {
      heading: "Let's build your creator DNA",
      intro: 'We read your public posts to draft a profile of your niches, audience and reach — so brands can find and work with you.',
      pointPublic: 'Only your public posts — nothing private',
      pointTime: 'Takes about a minute',
      pointEdit: 'You review & edit before anything goes live',
      cta: 'Get started',
      platforms: 'Works with Instagram, YouTube and Threads',
    },
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
      unconfigured: 'Scanning is temporarily unavailable. Please try again later.',
      stepFetchingDesc: 'Reading your last ~24 posts',
      stepAnalyzingDesc: 'Finding your niches, tone & audience',
      stepReadyTitle: 'Your DNA is ready',
      stepReadyDesc: 'Building your creator profile',
      timeHint: 'Usually under a minute',
      elapsed: 'elapsed',
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
    enterStudio: 'Go to Creator Studio',
  },
  studio: {
    introHeading: 'Add your handles to begin',
    introSub: 'Usually takes 60–90 seconds. Do not close this tab.',
    instagram: 'Instagram',
    handlePlaceholder: 'handle',
    startScan: 'Start scan',
    scanningHeading: 'Scanning your profiles…',
    stepConnected: 'Connected to Instagram',
    stepFetched: 'Fetched 412 posts',
    stepClassified: 'Classified: 286 travel · 126 other',
    stepCities: 'Extracted 41 cities across 12 countries',
    stepPhotoScan: 'Photo scan complete · 22 landmarks identified',
    stepScoreReady: 'Engagement Score: ready',
    stepMissionsMatched: '6 missions matched',
    reportReadyHeading: 'Your Creator DNA is ready 🎉',
    lastScanned: 'Last scanned',
    postsAnalyzed: '412 posts analyzed',
    rescan: 'Rescan',
    rescanIn: 'Rescan in {days}d',
    lastScannedAgo: 'Last scanned {days}d ago',
    avgLikes: 'Avg Likes',
    avgSaves: 'Avg Saves',
    er: 'ER',
    travel: 'Travel',
    commission: 'commission',
    scoreBreakdownToggle: 'How is my score calculated?',
    scoreBreakdownReach: 'Reach',
    scoreBreakdownEr: 'Engagement rate',
    scoreBreakdownTravel: 'Travel content focus',
    scoreBreakdownDiversity: 'Country diversity',
    scoreBreakdownRecency: 'Recent travel activity',
    scoreBreakdownReachTip: 'Based on your total followers across platforms',
    scoreBreakdownErTip: 'Saves weighted 3× — they signal strong intent',
    scoreBreakdownTravelTip: 'Percentage of recent posts classified as travel',
    scoreBreakdownDiversityTip: 'More countries = broader merchant reach (capped at 10)',
    scoreBreakdownRecencyTip: 'Are you still actively posting travel content?',
    scoreBreakdownPts: '{val} / {max} pts',
    scoreBreakdownTotal: 'Total: {total} pts → score {score}',
    engagementOverTime: 'Engagement over time',
    yourAudience: 'Your audience',
    audienceOther: 'Other',
    whatYouCreate: 'What you create',
    placesCovered: "Places you've covered",
    placesCoveredSub: '{countries} countries · {cities} cities — extracted from your posts',
    topVenues: 'Top venues',
    bestTravelPosts: 'Your best travel posts',
    rankedByEngagement: 'Ranked by engagement',
    knownFor: "What you're known for",
    matchedForYou: 'Matched for you · 6 NEW',
    reachToUnlock: 'Reach {tier} to unlock',
    viewAllMissions: 'View all 6 missions',
    publishProfile: 'Publish my profile →',
    shareDnaCard: 'Share DNA card',
    shareDialogTitle: 'Share your DNA card',
    shareCopyLink: 'Copy link',
    shareCopied: 'Copied',
    deltaUnchanged: 'Unchanged',
    deltaSinceLastScan: '{delta} since last scan',
    scanHint: 'We scan your public posts to build your DNA.',
    dnaCoreHeading: 'Your Creator DNA',
    dnaBio: 'Bio',
    dnaNiches: 'Niches',
    dnaPillars: 'Content pillars',
    dnaTone: 'Tone',
    dnaAudienceGeos: 'Top regions',
    dnaLocales: 'Top locales',
    dnaLanguages: 'Languages',
    dnaPlatforms: 'Platforms',
    sampleBadge: 'Sample',
    sampleNote: 'The numbers below are sample data — your real metrics arrive after your first full scan.',
    noDnaHeading: 'Build your Creator DNA',
    noDnaBody: 'Run a scan to generate your real creator DNA, then come back to see your Studio report.',
    noDnaCta: 'Start your scan',
  },
  creatorProfile: {
    metaTitle: '{name} (@{handle}) — Travel Creator · DNA {score} | KINNSO',
    metaDescription: '{category} travel creator based in {city}. {countries} countries · {guides} Guides. DNA Score {score}, {tier} tier.',
    notFoundTitle: 'Creator not found · KINNSO',
    follow: 'Follow',
    following: 'Following',
    statGuides: 'Guides',
    statCountries: 'Countries',
    statCities: 'Cities',
    statReach90d: 'Reach 90d',
    statDrivenGmv: 'Driven GMV',
    engagementBandSummary: 'ER {er}% · Avg 3.4k likes · 980 saves',
    notConnected: 'Not connected',
    followers: 'followers',
    avgEng: 'Avg eng.',
    travelPct: '{pct}% travel',
    destinationsCovered: 'Destinations covered',
    destinationsCoveredSub: '{countries} countries · {cities} cities — extracted from public posts',
    topPlacesCovered: 'Top places covered',
    dnaScore6mo: 'DNA score · 6 months',
    contentMix: 'Content mix',
    topTags: 'Top tags',
    latestGuides: 'Latest Guides',
    viewAllGuides: 'View all guides →',
    recentPosts: 'Recent posts',
    tabAll: 'All',
    tabInstagram: 'Instagram',
    tabThreads: 'Threads',
    tabYoutube: 'YouTube',
    cityPostsHeading: 'Posts from this city',
    cityPlacesHeading: 'Places in this city',
    cityNoPosts: 'No posts yet.',
    cityFirstVisited: 'First visited',
    cityLastVisited: 'Last visited',
    cityPosts: 'Posts',
    cityAvgEng: 'Avg eng.',
    cityTotalEngagement: '{count} total engagement',
    brandWorkWith: 'Work with {name}',
    brandTierLine: '{payout} · {commission} affiliate commission · {tier} tier',
    brandReachLine: '{reach} reach · {countries} countries · DNA {score}',
    brandSendBrief: 'Send a brief →',
    brandSaveToList: 'Save to list',
    brandSignInToContact: 'Sign in as merchant to contact',
  },
  merchants: {
    heading: 'Find the right creator',
    sub: 'Ranked by match score to your business profile. Updated daily.',
    yourProfile: 'Your profile',
    searchPlaceholder: 'Search by name, city, or tag…',
    filter: 'Filter',
    tabRecommended: 'Recommended',
    tabSaved: 'Saved',
    tabWorking: 'Working with',
    emptyRecommended: 'No creators match your filters.',
    emptySaved: "You haven't saved any creators yet.",
    emptyWorking: 'No active collaborations.',
    addPrivateNote: 'Add a private note…',
    statusInProgress: 'in progress',
    statusDelivered: 'delivered',
    statusCompleted: 'completed',
    matchLabel: 'match',
    reasonCovers: 'Covers {city}',
    reasonCreator: '{category} creator',
    reasonTier: '{tier} tier',
    reasonAudience: '{pct}% {country} audience',
    cardDna: 'DNA',
    cardEr: 'ER',
    cardGuides: '{count} Guides',
    cardReach: '{count}k Reach',
    cardCountries: '{count} Countries',
    viewProfile: 'View profile',
    sendBrief: 'Send brief →',
    save: 'Save',
    saved: 'Saved',
    showDetails: 'Show details',
    hideDetails: 'Hide details',
    detailTopLocations: 'Top locations',
    detailContentSample: 'Content sample',
    detailEngagementTrend: 'Engagement trend',
    filterTitle: 'Filter creators',
    filterLocation: 'Location',
    filterScore: 'Engagement score',
    filterMinEr: 'Minimum ER %',
    filterTier: 'Tier',
    filterCategory: 'Content category',
    filterAudience: 'Primary audience',
    filterPlatforms: 'Platforms',
    filterMinFollowers: 'Minimum followers',
    filterActivity: 'Activity',
    followersAny: 'Any',
    activity7: 'Posted in last 7 days',
    activity30: 'Last 30 days',
    activity90: 'Last 90 days',
    activityAny: 'Any time',
    clearAll: 'Clear all',
    applyFilters: 'Apply filters',
    close: 'Close',
    searchesLeft: '{count} searches left',
    invitesLeft: '{count} invites left',
    upgradeToGrowth: 'Upgrade to Growth',
    upgradeBlurb: 'Unlock advanced filters, unlimited search, and creator invites with Growth.',
    upgradeCta: 'Upgrade',
    lockedFilter: 'Available on Growth',
    inviteDisabled: 'No invites left this month',
    resultsCapped: 'Showing top results. Upgrade to Growth to see all matches.',
  },
  missions: {
    missionQueue: 'Mission queue',
    joinMission: 'Join mission',
    applyMission: 'Apply mission',
    generatePartnerLink: 'Generate partner link',
    approve: 'Approve',
    reject: 'Reject',
    requestRevision: 'Request revision',
    submitMilestone: 'Submit milestone',
    participants: 'Participants',
    pendingApplications: 'Pending applications',
    settlement: 'Settlement',
    postHeading: 'Post a mission',
    postSub: 'Create coupon, hybrid, or paid creator work in one flow.',
    typeCoupon: 'Coupon affiliate',
    typeHybrid: 'Affiliate + paid mission',
    typePaid: 'Paid mission only',
    title: 'Mission title',
    summary: 'Mission summary',
    couponCode: 'Coupon code',
    couponUrl: 'Coupon URL',
    affiliateCommissionRate: 'Affiliate commission rate',
    kinnsoCommissionRate: 'KINNSO commission rate',
    creatorCommissionRate: 'Creator commission rate',
    paidFeeAmount: 'Paid mission fee',
    paidFeeCurrency: 'Currency',
    milestoneTitle: 'Milestone title',
    milestoneDescription: 'Milestone description',
    saveDraft: 'Save draft',
    publish: 'Publish',
    openMission: 'Open mission',
    targetedMission: 'Targeted invite',
    validationError: 'Check the highlighted fields and try again.',
    myMissions: 'My missions',
    availableMissions: 'Available missions',
    milestoneProgress: 'milestones submitted',
    myMissionsEmpty: "You haven't joined any missions yet.",
    availableEmpty: 'No missions available right now. Check back soon.',
  },
  ops: {
    settlementHeading: 'Settlement queue',
    settlementSub: 'Track creator payouts and KINNSO commissions.',
    markPaid: 'Mark paid',
    statusPending: 'Pending',
    statusPaid: 'Paid',
  },
  nav: {
    linkCreators: 'Creators', linkMerchants: 'Merchants', linkAgent: 'AI Agent', linkTravelers: 'Travelers',
    linkGuides: 'Guides', linkArticles: 'Articles', linkFindCreators: 'Find Creators',
    ctaApply: 'Apply as Creator', ctaOpenStudio: 'Open Studio', ctaPending: 'Application pending', ctaPostMission: 'Post a Mission',
    signIn: 'Sign in', language: 'Language', menuToggle: 'Menu', skipToContent: 'Skip to content',
  },
  footer: {
    tagline: 'AI Travel Content Studio · Pays creators · Hong Kong · Taipei · Tokyo',
    colCreators: 'Creators', colMerchants: 'Merchants', colCompany: 'Company',
    lApply: 'Apply', lStudio: 'Studio', lMissions: 'Missions', lEarnings: 'Earnings',
    lPostMission: 'Post a mission', lPricing: 'Pricing', lCaseStudies: 'Case studies', lContact: 'Contact',
    lAbout: 'About', lAgent: 'AI Agent', lPress: 'Press', lLegal: 'Legal',
    rights: '© 2026 KINNSO. All rights reserved.',
  },
  home: {
    heroPill: 'Creator route / HK -> JP -> TW',
    heroTitle: 'Trips that pay their way.',
    heroSubtitle: 'KINNSO scans your social route, proves your city authority, and matches you with missions that turn guides into income.',
    applyCta: 'Apply as Creator',
    howHeading: 'Your route to paid travel work',
    howSub: 'A real sequence: scan, qualify, match, publish, earn.',
    step1Title: 'Scan a handle',
    step1Desc: 'Connect IG, Threads, TikTok, or YouTube signals.',
    step2Title: 'Prove your cities',
    step2Desc: 'KINNSO maps travel posts, places, and audience fit.',
    step3Title: 'Match with missions',
    step3Desc: 'Merchants send briefs based on your route and score.',
    step4Title: 'Publish and earn',
    step4Desc: 'Turn guides, partner links, and briefs into payouts.',
    merchantWall: 'Partner stamps',
    featuredHeading: 'Creator passes this week',
    featuredSub: 'Real handles, city proof, and score signals.',
    featuredSeeAll: 'See all',
    travelersTitle: 'For Travelers',
    travelersDesc: 'Follow real creators, save guide tickets, and book the exact same spots.',
    travelersCta: 'Explore Guides',
    merchantsTitle: 'For Merchants',
    merchantsDesc: 'Issue a mission ticket and match with creators who already own the route.',
    merchantsCta: 'Post a Mission',
  },
  comingSoon: {
    heading: 'Coming soon',
    body: 'This part of KINNSO is on the way. Check back shortly.',
    back: 'Back to home',
  },
  studioHome: {
    pill: 'Creator Studio',
    heading: 'Your Studio',
    subtitle: 'Everything you need to grow — scan your DNA, take missions, and track earnings.',
    liveBadge: 'Live', soonBadge: 'Soon', open: 'Open',
    scanTitle: 'AI Scan', scanDesc: 'Your creator DNA, score and tier.',
    missionsTitle: 'Missions', missionsDesc: 'Briefs you can join and submit.',
    earningsTitle: 'Earnings', earningsDesc: 'Payouts, commission and history.',
    offersTitle: 'Offers', offersDesc: 'Affiliate offers to promote.',
    inboxTitle: 'Inbox', inboxDesc: 'Messages from merchants.',
    guidesTitle: 'New Guide', guidesDesc: 'Publish a travel guide.',
  },
  studioDashboard: {
    greeting: 'Welcome back, {name}',
    statusActive: 'Active creator',
    dnaSnapshotTitle: 'Your Creator DNA',
    dnaLastScanned: 'last scanned {date}',
    dnaNiches: 'Niches',
    dnaPillars: 'Content pillars',
    viewFullReport: 'View full DNA report →',
    checklistTitle: 'Get discovered',
    checklistProgress: '{done} / {total}',
    itemDnaReadyTitle: 'Your Creator DNA is ready',
    itemDnaReadyCta: 'View report',
    itemWriteGuideTitle: 'Write your first guide',
    itemWriteGuideCta: 'Write a guide',
    itemConnectTitle: 'Connect your platforms',
    itemConnectGap: '{done}/{total} · add {missing}',
    itemConnectCta: 'Add',
    itemConnectAllDone: 'All platforms connected',
    itemFreshTitle: 'Keep your DNA fresh',
    itemFreshScanned: 'scanned {days}d ago',
    itemFreshScannedToday: 'scanned today',
    rescanCta: 'Rescan',
    opportunitiesTitle: 'Opportunities',
    opportunitiesEmpty: "No brand missions matched yet — we’ll notify you. Finish your checklist to get discovered.",
    opportunitiesBrowse: 'Browse all',
    earningsTitle: 'Earnings',
    earningsEmpty: 'Start earning by joining a mission.',
    earningsView: 'View earnings',
    quickLinksTitle: 'Quick links',
    addHandleTitle: 'Add a platform',
    addHandlePlaceholder: 'handle or profile link',
    addHandleSave: 'Add',
    addHandleCancel: 'Cancel',
    addHandleErrorEmpty: 'Enter a handle.',
    addHandleErrorFormat: 'That handle has invalid characters.',
    addHandleErrorLength: 'That handle is too long (max 30).',
    addHandleSaved: 'Added — rescan to include it in your DNA.',
  },
  studioGuides: {
    listPill: 'Studio',
    listHeading: 'My guides',
    listSubtitle: 'Draft, publish, and manage the travel guides you share on KINNSO.',
    newButton: 'New guide',
    emptyTitle: 'No guides yet',
    emptyBody: 'Publish your first guide and it will appear in Explore.',
    statusDraft: 'Draft',
    statusPublished: 'Published',
    edit: 'Edit',
    delete: 'Delete',
    deleteConfirm: 'Delete this guide? This cannot be undone.',
    formNewHeading: 'New guide',
    formEditHeading: 'Edit guide',
    titleLabel: 'Title',
    titlePlaceholder: 'e.g. Shibuya Coffee Crawl: 7 Quiet Roasters',
    cityLabel: 'City',
    cityPlaceholder: 'e.g. Tokyo',
    coverLabel: 'Cover image URL',
    coverPlaceholder: 'https://…',
    coverPreviewAlt: 'Cover preview',
    summaryLabel: 'Summary',
    summaryPlaceholder: 'A short description of what this guide covers.',
    saveDraft: 'Save draft',
    publish: 'Publish',
    saving: 'Saving…',
    backToGuides: 'Back to my guides',
    errorTitleRequired: 'Add a title.',
    errorSummaryRequired: 'Add a summary.',
    errorCityRequired: 'Add a city.',
    errorCoverRequired: 'Add a cover image URL.',
    errorCoverInvalid: 'Enter a valid image URL (http or https).',
    errorGeneric: 'Something went wrong. Please try again.',
  },
  explore: {
    pill: 'Explore',
    heading: 'Travel Guides from real creators',
    subtitle: 'Discover hand-picked spots, saved by travelers like you.',
    savesLabel: 'saves',
    emptyNote: 'More guides are added every week.',
  },
  feed: {
    pill: 'Feed',
    heading: 'What travelers are saving now',
    subtitle: 'A live look at the guides and spots trending across KINNSO.',
    savesLabel: 'saves',
    empty: 'No guides yet. Check back soon for new travel guides.',
  },
  creatorsLanding: {
    heroPill: 'Creator Program',
    heroTitle: 'Get paid to share the trips you already take.',
    heroSubtitle: 'KINNSO proves your travel authority and matches you with paid missions from real merchants.',
    applyCta: 'Apply as Creator',
    howHeading: 'How the program works', howSub: 'From handle to first payout in days.',
    step1Title: 'Connect socials', step1Desc: 'Add your IG / Threads / TikTok handles.',
    step2Title: 'AI scans you', step2Desc: 'We classify your travel posts and score you.',
    step3Title: 'Get qualified', step3Desc: 'Reach a Tier and unlock the Studio.',
    step4Title: 'Earn missions', step4Desc: 'Publish Guides and get paid.',
    featuredHeading: 'Creators already earning', featuredSub: 'Real handles, scored by our AI Agent.',
    ctaTitle: 'Ready to apply?', ctaDesc: 'It takes two minutes and a couple of handles.', ctaButton: 'Start your application',
  },
  merchantsLanding: {
    heroPill: 'For Merchants',
    heroTitle: 'Reach travelers through creators they trust.',
    heroSubtitle: 'Post a mission and pay only when a real creator publishes and drives clicks.',
    postCta: 'Post a Mission', browseCta: 'Browse creators',
    howHeading: 'How it works', howSub: 'Launch a campaign in three steps.',
    step1Title: 'Post a brief', step1Desc: 'Describe the mission, cities and payout.',
    step2Title: 'Creators apply', step2Desc: 'Qualified creators join and submit work.',
    step3Title: 'Pay on results', step3Desc: 'Approve submissions and pay on publish.',
    samplesHeading: 'Open missions right now', samplesSub: 'A sample of live briefs from merchants.',
    ctaTitle: 'Ready to launch?', ctaDesc: 'Post your first mission today.', ctaButton: 'Post a Mission',
  },
  studioOffers: {
    heading: 'Affiliate offers',
    subtitle: 'Join travel affiliate programs and generate tracked partner links.',
    empty: 'No affiliate offers are available right now.',
    join: 'Join offer',
    generateLink: 'Generate partner link',
    copy: 'Copy',
    copied: 'Copied',
    category: 'Category',
    commission: 'Commission',
    viewProgram: 'View program',
  },
  studioEarnings: {
    heading: 'Earnings',
    subtitle: 'Track payouts from missions and affiliate commissions.',
    paid: 'Paid',
    pending: 'Pending',
    empty: 'No earnings yet. Completed missions and settled commissions will appear here.',
    colMission: 'Mission',
    colType: 'Type',
    colAmount: 'Amount',
    colStatus: 'Status',
  },
}
export default messages

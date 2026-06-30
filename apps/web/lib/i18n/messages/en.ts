export interface Messages {
  brand: string
  categories: { destinations: string; dining: string; shopping: string }
  breadcrumb: { home: string; articles: string }
  article: { youMayLike: string; faqTitle: string; tableOfContents: string; by: string; fallbackNotice: string }
  seo: {
    brandTitle: string
    brandDescription: string
    home: { title: string; description: string }
    explore: { title: string; description: string }
    creators: { title: string; description: string }
    agent: { title: string; description: string }
    about: { title: string; description: string }
    contact: { title: string; description: string }
    merchants: { title: string; description: string }
    terms: { title: string; description: string }
  }
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
    signUpCreatorTitle: string
    signUpCreatorSubtitle: string
    termsPrefix: string
    termsLink: string
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
    demoBanner: string
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
    nichesHeading: string
    pillarsHeading: string
    toneHeading: string
    audienceRegionsLabel: string
    audienceLocalesLabel: string
    languagesHeading: string
    platformsHeading: string
    verifiedLabel: string
    guidesHeading: string
    guidesEmpty: string
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
    backToQueue: string
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
    viewDetails: string
    postSuccessTitle: string
    postSuccessBody: string
    viewMission: string
    missionsEmptyTitle: string
    missionsEmptyBody: string
    postMissionCta: string
    creatorFallback: string
    locked: string
    lockedHelp: string
    minTierLabel: string
    minTierOpen: string
    minTierRising: string
    minTierPro: string
    minTierElite: string
    invitationsTitle: string
    acceptInvite: string
    acceptInviteFailed: string
  }
  missionDetail: {
    back: string
    briefHeading: string
    milestonesHeading: string
    notStarted: string
    dueLabel: string
    join: string
    apply: string
    applyNoteLabel: string
    applyNotePlaceholder: string
    awaitingTitle: string
    awaitingBody: string
    rejectedTitle: string
    rejectedBody: string
    couponHeading: string
    couponCodeLabel: string
    partnerLinksHeading: string
    openLink: string
    proofUrlLabel: string
    proofUrlPlaceholder: string
    submissionNotesLabel: string
    submissionNotesPlaceholder: string
    submitMilestone: string
    resubmitMilestone: string
    submitError: string
    merchantFeedbackLabel: string
    verifying: string
    verifiedSignal: string
    needsReview: string
    couldntVerify: string
    verificationFailed: string
    retry: string
  }
  ops: {
    backHome: string
    settlementHeading: string
    settlementSub: string
    markPaid: string
    statusPending: string
    statusPaid: string
  }
  nav: {
    linkCreators: string; linkMerchants: string; linkAgent: string; linkTravelers: string
    linkGuides: string; linkArticles: string; linkFindCreators: string; linkMissions: string
    linkInsights: string
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
    merchantWall: string; featuredHeading: string; featuredSub: string; featuredSeeAll: string; featuredEmpty: string
    travelersTitle: string; travelersDesc: string; travelersCta: string
    merchantsTitle: string; merchantsDesc: string; merchantsCta: string
  }
  about: {
    eyebrow: string; title: string; intro: string
    missionHeading: string; missionBody: string
    creatorsHeading: string; creatorsBody: string
    merchantsHeading: string; merchantsBody: string
    ctaHeading: string; ctaBody: string; ctaButton: string
  }
  contact: {
    eyebrow: string; title: string; intro: string
    emailLabel: string; emailCta: string; responseNote: string
  }
  comingSoon: { heading: string; body: string; back: string }
  creatorTerms: {
    eyebrow: string; title: string; draftNotice: string; englishNotice: string; back: string
  }
  agent: {
    heroPill: string; heroTitle: string; heroSubtitle: string
    heroCta: string; heroSecondaryCta: string
    valuesHeading: string
    value1Title: string; value1Desc: string
    value2Title: string; value2Desc: string
    value3Title: string; value3Desc: string
    tiersHeading: string; tiersSub: string; comingNote: string
    ctaTitle: string; ctaDesc: string; ctaButton: string
  }
  studioHome: {
    pill: string; heading: string; subtitle: string
    liveBadge: string; soonBadge: string; open: string
    scanTitle: string; scanDesc: string
    missionsTitle: string; missionsDesc: string
    earningsTitle: string; earningsDesc: string
    offersTitle: string; offersDesc: string
    inboxTitle: string; inboxDesc: string
    guidesTitle: string; guidesDesc: string
    tierTitle: string
    tierDesc: string
    copilotTitle: string
    copilotDesc: string
    perksTitle: string
    perksDesc: string
    insightsTitle: string
    insightsDesc: string
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
    directoryHeading: string
    directorySub: string
    directoryEmpty: string
    viewProfile: string
    guideCount: string
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
    setupNotConfigured: string
    trackingId: string
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
  tier: {
    cardTitle: string
    toNext: string
    maxed: string
    earnHeading: string
    earnGuide: string
    earnMission: string
    earnScan: string
    viewAll: string
    pageHeading: string
    pageSubtitle: string
    currentLabel: string
    allTiersHeading: string
    unlocksHeading: string
    unlocksMissions: string
    unlocksHelp: string
    historyHeading: string
    historyEmpty: string
    eventGuide: string
    eventMission: string
    eventScan: string
    pointsSuffix: string
  }
  copilot: {
    title: string; subtitle: string
    inputPlaceholder: string; send: string; newChat: string
    emptyTitle: string; emptyBody: string
    limitTitle: string; limitBody: string; limitUpsell: string
    toolWorking: string
    errorGeneric: string
    unconfiguredTitle: string; unconfiguredBody: string
    disclaimer: string
  }
  admin: {
    navDashboard: string; navPerks: string; navUsers: string; navCreators: string; navMerchants: string
    dashboardTitle: string; dashboardSubtitle: string
    statCreators: string; statMerchants: string; statOps: string
    statPerksActive: string; statPerksTotal: string; statRedemptions: string
  }
  creators: {
    title: string; subtitle: string
    kpiTotal: string; kpiActive: string; kpiSuspended: string; kpiOnboarding: string
    kpiNew: string; kpiPayoutsPending: string
    trendSignups: string; trendEngagement: string; trendEmpty: string
    leaderboardTitle: string; leaderboardEmpty: string; points: string
    atRiskTitle: string; atRiskEmpty: string; reasonScanFailed: string; reasonNoMissions: string
    activityTitle: string; activityEmpty: string
    statusOnboarding: string; statusActive: string; statusSuspended: string; statusBanned: string
    tierSeed: string; tierRising: string; tierPro: string; tierElite: string
    verified: string
    dirSearch: string; dirStatus: string; dirTier: string; dirDna: string; dirVerifiedOnly: string
    dirAll: string; dirLoadMore: string; dirEmpty: string
    colName: string; colTier: string; colDna: string; colJoined: string; colActions: string
    dnaPublished: string; dnaDraft: string; dnaNone: string
    actActivate: string; actSuspend: string; actBan: string; actReinstate: string
    actVerify: string; actUnverify: string; actNote: string; actApply: string; actCancel: string
    reasonPlaceholder: string; notePlaceholder: string
    confirmBan: string; confirmReinstate: string
    bulkApply: string; bulkSelected: string; bulkChooseAction: string
    actionFailed: string
    tabOverview: string; tabDirectory: string
    detailBack: string; detailJoined: string; detailUpdated: string; detailBio: string; detailNoBio: string
    tabProfile: string; tabMissions: string; tabEarnings: string; tabContent: string; tabModeration: string
    secDna: string; secScan: string; secSocials: string; secContribution: string
    dnaNoData: string; scanNoData: string; socialsNoData: string
    scanStatus: string; scanError: string; scanCompleted: string
    colMission: string; colStatus: string; colSource: string; colMilestones: string; missionsNoData: string
    colAmount: string; colPayout: string; colSettlement: string; settlementsNoData: string
    pointsHistory: string; colEvent: string; colPoints: string; pointsNoData: string; totalPoints: string
    colTitle: string; colSaves: string; colStatusContent: string; contentNoData: string
    secAudit: string; auditNoData: string; addNote: string; saveNote: string
    tabPayouts: string
    payoutsQueue: string; payoutsOwed: string; payoutsSettled: string
    setNotStarted: string; setPending: string; setPartiallyPaid: string; setPaid: string; setDisputed: string
    colOpsNote: string
    actMarkPaid: string; actMarkDisputed: string
    confirmMarkPaid: string; confirmMarkDisputed: string
    payoutsEmpty: string
    reasonRequired: string
  }
  merchantsOps: {
    title: string; subtitle: string
    tabOverview: string; tabDirectory: string
    kpiTotal: string; kpiActive: string; kpiPaused: string; kpiSuspended: string; kpiArchived: string
    kpiFree: string; kpiGrowth: string; kpiNew: string; kpiMissionsLive: string; kpiSettlementsPending: string
    trendSignups: string; trendMissions: string; trendEmpty: string
    leaderboardTitle: string; leaderboardEmpty: string; lbMissions: string; lbCreators: string
    atRiskTitle: string; atRiskEmpty: string
    reasonGrowthIdle: string; reasonDisputed: string; reasonPendingOverdue: string
    activityTitle: string; activityEmpty: string
    dirSearch: string; dirStatus: string; dirTier: string; dirAll: string
    dirLoadMore: string; dirEmpty: string
    colName: string; colStatus: string; colTier: string; colJoined: string; colActions: string
    statusActive: string; statusPaused: string; statusSuspended: string; statusArchived: string
    tierFree: string; tierGrowth: string
    actSetStatus: string; actSetTier: string; actNote: string; actApply: string; actCancel: string
    reasonPlaceholder: string; notePlaceholder: string
    confirmArchive: string
    bulkApply: string; bulkSelected: string; bulkChooseAction: string
    actionFailed: string
  }
  perks: {
    catalog: {
      heading: string; subtitle: string; empty: string
      lockedBadge: string; requiresTier: string; unlockCta: string
      redeem: string; redeemed: string; reveal: string; hide: string
      copyCode: string; copied: string; openDeal: string; redeemFailed: string
    }
    admin: {
      title: string; subtitle: string; newPerk: string; editPerk: string; empty: string
      fieldPartner: string; fieldTitle: string; fieldSummary: string; fieldCategory: string
      fieldDiscount: string; fieldMinTier: string; fieldRedemptionType: string
      fieldRedemptionValue: string; fieldSortOrder: string; fieldActive: string
      tierOpen: string; tierRising: string; tierPro: string; tierElite: string
      typeCode: string; typeLink: string
      save: string; cancel: string; activate: string; deactivate: string
      statusActive: string; statusInactive: string
    }
    tierLabels: { rising: string; pro: string; elite: string }
  }
  users: {
    title: string; subtitle: string
    sectionCreators: string; sectionMerchants: string; sectionOps: string
    empty: string; joined: string; unnamed: string
    activate: string; suspend: string
    statusActive: string; statusSuspended: string
    statusOnboarding: string; statusPaused: string; statusArchived: string
    errorGeneric: string
    tierLabel: string; tierFree: string; tierGrowth: string
  }
  merchantSearch: {
    heading: string
    sub: string
    searchPlaceholder: string
    filter: string
    filtersLocked: string
    upgradeTitle: string
    upgradeBlurb: string
    upgradeCta: string
    tabRecommended: string
    tabSaved: string
    tabWorking: string
    emptyRecommended: string
    emptySaved: string
    emptyWorking: string
    resultsCapped: string
    invitesLeft: string
    reasonNiche: string
    reasonGeo: string
    reasonLanguage: string
    reasonPlatform: string
    guidesLabel: string
    viewProfile: string
    save: string
    saved: string
    sendBrief: string
    addNote: string
    pickMissionTitle: string
    pickMissionEmpty: string
    invited: string
    filterNiches: string
    filterGeos: string
    filterLanguages: string
    filterPlatforms: string
    filterHasGuides: string
    inviteQuotaExceeded: string
    alreadyParticipant: string
    inviteFailed: string
  }
  insights: {
    navLabel: string
    empty: string
    creatorTitle: string
    creatorSubtitle: string
    pointsTotal: string
    pointsTrajectory: string
    pointsByType: string
    typeGuide: string
    typeMission: string
    typeScan: string
    tierProgress: string
    tierAtMax: string
    pointsToNext: string
    guidesPublished: string
    guideSaves: string
    missionsTitle: string
    statusApplied: string
    statusActive: string
    statusInvited: string
    statusRejected: string
    deliverables: string
    creatorEmptyPoints: string
    creatorEmptyMissions: string
    merchantTitle: string
    merchantSubtitle: string
    missionsPublished: string
    participants: string
    inviteAcceptRate: string
    deliveredWork: string
    perMissionTitle: string
    colMission: string
    colInvited: string
    colApplied: string
    colActive: string
    colRejected: string
    colDelivered: string
    merchantEmpty: string
    notApplicable: string
  }
}

const messages: Messages = {
  brand: 'Kinnso',
  categories: { destinations: 'Destinations', dining: 'Dining', shopping: 'Shopping' },
  breadcrumb: { home: 'Home', articles: 'Articles' },
  article: { youMayLike: 'You may like', faqTitle: 'Frequently asked questions', tableOfContents: 'In this article', by: 'By', fallbackNotice: "This article isn't available in your language yet — showing the original version." },
  seo: {
    brandTitle: 'KINNSO — Travel creators, real missions',
    brandDescription:
      'KINNSO connects travel and lifestyle creators with real brand missions, affiliate offers, and an AI copilot to grow your audience.',
    home: {
      title: 'Travel creators, real missions',
      description:
        'Join KINNSO to find real brand missions, earn from affiliate offers, and grow with an AI copilot built for travel creators.',
    },
    explore: {
      title: 'Explore creator guides',
      description: 'Browse real travel guides published by KINNSO creators across Asia and beyond.',
    },
    creators: {
      title: 'Discover travel creators',
      description: 'Find travel and lifestyle creators on KINNSO by niche, audience, and platform.',
    },
    agent: {
      title: 'Creator Copilot — your AI growth assistant',
      description: 'Meet the KINNSO Creator Copilot: AI agents that help you find content ideas, grow your audience, and earn more.',
    },
    about: {
      title: 'About KINNSO',
      description: 'KINNSO is the creator platform connecting travel and lifestyle creators with real brand missions.',
    },
    contact: {
      title: 'Contact KINNSO',
      description: 'Get in touch with the KINNSO team about partnerships, missions, and creator support.',
    },
    merchants: {
      title: 'For brands and merchants',
      description: 'Run real missions with vetted travel and lifestyle creators on KINNSO.',
    },
    terms: {
      title: 'Creator Terms',
      description: 'The terms that govern creators using KINNSO.',
    },
  },
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
    signUpCreatorTitle: 'Apply as a creator',
    signUpCreatorSubtitle: 'Create your account, scan your Creator DNA, and start earning with KINNSO.',
    termsPrefix: 'By creating an account you agree to our',
    termsLink: 'Creator Terms',
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
    demoBanner: 'Sample report — sign up and scan to see your own Creator DNA.',
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
    nichesHeading: 'Niches',
    pillarsHeading: 'Content pillars',
    toneHeading: 'Tone',
    audienceRegionsLabel: 'Top regions',
    audienceLocalesLabel: 'Audience locales',
    languagesHeading: 'Languages',
    platformsHeading: 'Platforms',
    verifiedLabel: 'Verified',
    guidesHeading: 'Published guides',
    guidesEmpty: 'No published guides yet.',
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
    missionQueue: 'Mission queue', backToQueue: 'Back to queue',
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
    viewDetails: 'View details',
    postSuccessTitle: 'Mission posted',
    postSuccessBody: 'Your mission is live. Manage applications and submissions from the mission page.',
    viewMission: 'View mission',
    missionsEmptyTitle: 'No missions yet',
    missionsEmptyBody: 'Post your first mission to start working with creators.',
    postMissionCta: 'Post a mission',
    creatorFallback: 'Creator',
    locked: 'Tier locked',
    lockedHelp: 'Reach this tier to unlock this mission.',
    minTierLabel: 'Minimum tier',
    minTierOpen: 'Open to all',
    minTierRising: 'Rising+',
    minTierPro: 'Pro+',
    minTierElite: 'Elite+',
    invitationsTitle: 'Invitations',
    acceptInvite: 'Accept invitation',
    acceptInviteFailed: 'Could not accept this invitation. Please try again.',
  },
  missionDetail: {
    back: 'Missions',
    briefHeading: 'Brief',
    milestonesHeading: 'Milestones',
    notStarted: 'Not started',
    dueLabel: 'Due',
    join: 'Join mission',
    apply: 'Apply',
    applyNoteLabel: 'Application note (optional)',
    applyNotePlaceholder: 'Tell the merchant why you are a fit',
    awaitingTitle: 'Awaiting approval',
    awaitingBody: 'The merchant is reviewing your application.',
    rejectedTitle: 'Not selected',
    rejectedBody: 'This application was not accepted.',
    couponHeading: 'Your coupon',
    couponCodeLabel: 'Code',
    partnerLinksHeading: 'Your links',
    openLink: 'Open',
    proofUrlLabel: 'Post URL',
    proofUrlPlaceholder: 'https://www.instagram.com/p/...',
    submissionNotesLabel: 'Notes (optional)',
    submissionNotesPlaceholder: 'Add context for the merchant',
    submitMilestone: 'Submit for review',
    resubmitMilestone: 'Resubmit',
    submitError: 'Submission could not be sent',
    merchantFeedbackLabel: 'Merchant feedback',
    verifying: 'Verifying…',
    verifiedSignal: 'Verified signal',
    needsReview: 'Needs review',
    couldntVerify: "Couldn’t verify",
    verificationFailed: 'Verification failed',
    retry: 'Retry',
  },
  ops: {
    settlementHeading: 'Settlement queue', backHome: 'Back to home',
    settlementSub: 'Track creator payouts and KINNSO commissions.',
    markPaid: 'Mark paid',
    statusPending: 'Pending',
    statusPaid: 'Paid',
  },
  nav: {
    linkCreators: 'Creators', linkMerchants: 'Merchants', linkAgent: 'AI Agent', linkTravelers: 'Travelers',
    linkGuides: 'Guides', linkArticles: 'Articles', linkFindCreators: 'Find Creators', linkMissions: 'Missions',
    linkInsights: 'Insights',
    ctaApply: 'Apply as Creator', ctaOpenStudio: 'Open Studio', ctaPending: 'Application pending', ctaPostMission: 'Post a Mission',
    signIn: 'Sign in', language: 'Language', menuToggle: 'Menu', skipToContent: 'Skip to content',
  },
  footer: {
    tagline: 'AI Travel Content Studio · Pays creators · Hong Kong · Taipei · Tokyo',
    colCreators: 'Creators', colMerchants: 'Merchants', colCompany: 'Company',
    lApply: 'Apply', lStudio: 'Studio', lMissions: 'Missions', lEarnings: 'Earnings',
    lPostMission: 'Post a mission', lPricing: 'How it works', lCaseStudies: 'Case studies', lContact: 'Contact',
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
    featuredHeading: 'Featured guides',
    featuredSub: 'Real city guides published by KINNSO creators.',
    featuredSeeAll: 'See all',
    featuredEmpty: 'No published guides yet — be the first to publish one.',
    travelersTitle: 'For Travelers',
    travelersDesc: 'Follow real creators, save guide tickets, and book the exact same spots.',
    travelersCta: 'Explore Guides',
    merchantsTitle: 'For Merchants',
    merchantsDesc: 'Issue a mission ticket and match with creators who already own the route.',
    merchantsCta: 'Post a Mission',
  },
  about: {
    eyebrow: 'About KINNSO',
    title: 'A creator-first travel & lifestyle community.',
    intro: 'KINNSO helps travel and lifestyle creators turn real expertise into published guides, brand missions, and affiliate earnings — with the tools and the audience to grow.',
    missionHeading: 'What we do',
    missionBody: 'We connect creators with merchants and travellers across Hong Kong, Taipei, Tokyo and beyond. Creators publish guides, join brand missions, and earn through affiliate offers; merchants reach trusted local voices.',
    creatorsHeading: 'For creators',
    creatorsBody: 'Build a public profile, publish guides, and join real missions and affiliate offers — paid honestly, with no fabricated metrics.',
    merchantsHeading: 'For merchants',
    merchantsBody: 'Post a mission, work with vetted creators, and track participation through a transparent pipeline.',
    ctaHeading: 'Want to create with KINNSO?',
    ctaBody: 'Apply as a creator and start building your profile today.',
    ctaButton: 'Apply as a creator',
  },
  contact: {
    eyebrow: 'Contact',
    title: 'Get in touch.',
    intro: 'Questions, partnerships, or press? Email us and we’ll get back to you.',
    emailLabel: 'Email',
    emailCta: 'Email us',
    responseNote: 'We typically reply within a few business days.',
  },
  comingSoon: {
    heading: 'Coming soon',
    body: 'This part of KINNSO is on the way. Check back shortly.',
    back: 'Back to home',
  },
  creatorTerms: {
    eyebrow: 'Creator terms',
    title: 'Creator Terms (MVP draft)',
    draftNotice: 'This is an early draft of our creator terms for KINNSO’s soft launch. It is written in plain language, is not a final legal contract, and may change. We’ll notify creators of material updates.',
    englishNotice: 'These terms are currently provided in English only.',
    back: 'Back to home',
  },
  agent: {
    heroPill: 'Creator Copilot',
    heroTitle: 'Your AI copilot for growing as a creator',
    heroSubtitle: 'KINNSO Copilot is a growing library of saved AI agents that help you grow your audience, find your next idea, and produce content that earns.',
    heroCta: 'Join as a creator',
    heroSecondaryCta: 'See how it works',
    valuesHeading: 'What your copilot will do',
    value1Title: 'Grow your audience',
    value1Desc: 'Data-backed prompts on what to post, when, and where — tuned to your Creator DNA.',
    value2Title: 'Never run out of ideas',
    value2Desc: 'Surface fresh content angles and trending places that fit your niche and audience.',
    value3Title: 'Produce better content',
    value3Desc: 'Turn a rough idea into captions, shot lists, and guide drafts you can publish in minutes.',
    tiersHeading: 'A better copilot as you climb',
    tiersSub: 'Publish guides and complete missions to level up. Higher tiers unlock more agents, higher limits, better commissions, and exclusive missions.',
    comingNote: 'The copilot ships inside Studio in a later release. Join now to be first in line.',
    ctaTitle: 'Get your copilot',
    ctaDesc: 'Sign up as a creator, scan your DNA, and be first to use the copilot when it lands.',
    ctaButton: 'Join KINNSO',
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
    guidesTitle: 'Guides', guidesDesc: 'Draft and publish your guides.',
    tierTitle: 'Tier', tierDesc: 'Your contribution points and tier.',
    copilotTitle: 'Copilot',
    copilotDesc: 'Chat with your AI copilot for ideas, captions, and content.',
    perksTitle: 'Perks', perksDesc: 'Partner deals unlocked by your tier.',
    insightsTitle: 'Insights', insightsDesc: 'Your real activity — points, guides, and missions.',
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
    directoryHeading: 'Browse creators',
    directorySub: "Real KINNSO creators and the city guides they've published.",
    directoryEmpty: 'No creators have published a profile yet. Check back soon.',
    viewProfile: 'View profile',
    guideCount: '{count} Guides',
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
    setupNotConfigured: 'Partner-link generation is being set up — check back soon.',
    trackingId: 'Tracking ID',
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
  tier: {
    cardTitle: 'Your tier',
    toNext: '{points} pts to {tier}',
    maxed: 'Top tier reached',
    earnHeading: 'Ways to earn points',
    earnGuide: 'Publish a guide',
    earnMission: 'Complete a verified mission',
    earnScan: 'Complete your DNA scan',
    viewAll: 'Tier details',
    pageHeading: 'Tier & contribution',
    pageSubtitle: 'Earn points from real activity to climb tiers.',
    currentLabel: 'Current tier',
    allTiersHeading: 'All tiers',
    historyHeading: 'Points history',
    historyEmpty: 'No points yet — publish a guide or complete a mission to get started.',
    eventGuide: 'Guide published',
    eventMission: 'Mission verified',
    eventScan: 'DNA scan completed',
    pointsSuffix: 'pts',
    unlocksHeading: 'What you unlock',
    unlocksMissions: 'missions need this tier',
    unlocksHelp: 'Climb tiers to join exclusive missions.',
  },
  copilot: {
    title: 'Creator Copilot',
    subtitle: 'Your AI copilot, tuned to your Creator DNA. Ask for ideas, captions, or a posting plan.',
    inputPlaceholder: 'Ask your copilot anything…',
    send: 'Send',
    newChat: 'New chat',
    emptyTitle: 'Start a conversation',
    emptyBody: 'Try: "Give me 5 reel ideas for my next trip" or "Draft a caption for a Kyoto food guide".',
    limitTitle: "You've hit today's limit",
    limitBody: "You've used all of today's Copilot messages.",
    limitUpsell: 'Level up your tier to raise your daily limit.',
    toolWorking: 'Working on it…',
    errorGeneric: 'Something went wrong. Please try again.',
    unconfiguredTitle: "Copilot isn't switched on yet",
    unconfiguredBody: 'The Copilot will be available here shortly. Check back soon.',
    disclaimer: 'AI-generated — review before you publish.',
  },
  admin: {
    navDashboard: 'Dashboard', navPerks: 'Perks', navUsers: 'Users', navCreators: 'Creators', navMerchants: 'Merchants',
    dashboardTitle: 'Admin', dashboardSubtitle: 'Manage perks, users, and platform content.',
    statCreators: 'Creators', statMerchants: 'Merchants', statOps: 'Ops members',
    statPerksActive: 'Active perks', statPerksTotal: 'Total perks', statRedemptions: 'Redemptions',
  },
  creators: {
    title: 'Creators',
    subtitle: 'Understand, moderate, analyze, and pay your creators.',
    kpiTotal: 'Total creators', kpiActive: 'Active', kpiSuspended: 'Suspended', kpiOnboarding: 'Onboarding',
    kpiNew: 'New this period', kpiPayoutsPending: 'Payouts pending',
    trendSignups: 'Signups', trendEngagement: 'Engagement (points)', trendEmpty: 'No data in this period',
    leaderboardTitle: 'Top contributors', leaderboardEmpty: 'No contributors yet', points: 'points',
    atRiskTitle: 'At-risk creators', atRiskEmpty: 'No at-risk creators',
    reasonScanFailed: 'Scan failed', reasonNoMissions: 'No active missions',
    activityTitle: 'Recent moderation activity', activityEmpty: 'No moderation activity yet',
    statusOnboarding: 'Onboarding', statusActive: 'Active', statusSuspended: 'Suspended', statusBanned: 'Banned',
    tierSeed: 'Seed', tierRising: 'Rising', tierPro: 'Pro', tierElite: 'Elite',
    verified: 'Verified',
    dirSearch: 'Search name or handle', dirStatus: 'Status', dirTier: 'Tier', dirDna: 'DNA', dirVerifiedOnly: 'Verified only',
    dirAll: 'All', dirLoadMore: 'Next page', dirEmpty: 'No creators match your filters',
    colName: 'Creator', colTier: 'Tier', colDna: 'DNA', colJoined: 'Joined', colActions: 'Actions',
    dnaPublished: 'Published', dnaDraft: 'Draft', dnaNone: 'None',
    actActivate: 'Activate', actSuspend: 'Suspend', actBan: 'Ban', actReinstate: 'Reinstate',
    actVerify: 'Verify', actUnverify: 'Unverify', actNote: 'Add note', actApply: 'Apply', actCancel: 'Cancel',
    reasonPlaceholder: 'Reason (required)', notePlaceholder: 'Note (required)',
    confirmBan: 'Ban this creator? This is a permanent state.', confirmReinstate: 'Reinstate this banned creator?',
    bulkApply: 'Apply to selected', bulkSelected: 'selected', bulkChooseAction: 'Choose an action',
    actionFailed: 'Action failed. Try again.',
    tabOverview: 'Overview', tabDirectory: 'Directory',
    detailBack: 'Back to directory', detailJoined: 'Joined', detailUpdated: 'Updated', detailBio: 'Bio', detailNoBio: 'No bio',
    tabProfile: 'Profile & DNA', tabMissions: 'Missions', tabEarnings: 'Earnings', tabContent: 'Content', tabModeration: 'Moderation',
    secDna: 'Creator DNA', secScan: 'Latest scan', secSocials: 'Social handles', secContribution: 'Contribution',
    dnaNoData: 'No DNA yet', scanNoData: 'No scans yet', socialsNoData: 'No social handles',
    scanStatus: 'Status', scanError: 'Error', scanCompleted: 'Completed',
    colMission: 'Mission', colStatus: 'Status', colSource: 'Source', colMilestones: 'Milestones', missionsNoData: 'No missions yet',
    colAmount: 'Amount', colPayout: 'Payout', colSettlement: 'Settlement', settlementsNoData: 'No settlements yet',
    pointsHistory: 'Points history', colEvent: 'Event', colPoints: 'Points', pointsNoData: 'No points activity yet', totalPoints: 'Total points',
    colTitle: 'Title', colSaves: 'Saves', colStatusContent: 'Status', contentNoData: 'No content yet',
    secAudit: 'Moderation history', auditNoData: 'No moderation activity yet', addNote: 'Add a note', saveNote: 'Save note',
    tabPayouts: 'Payouts',
    payoutsQueue: 'Settlements', payoutsOwed: 'Creator payout owed', payoutsSettled: 'Creator payout settled',
    setNotStarted: 'Not started', setPending: 'Pending', setPartiallyPaid: 'Partially paid', setPaid: 'Paid', setDisputed: 'Disputed',
    colOpsNote: 'Ops note',
    actMarkPaid: 'Mark paid', actMarkDisputed: 'Mark disputed',
    confirmMarkPaid: 'Mark this settlement fully paid? This records a creator payout.',
    confirmMarkDisputed: 'Flag this settlement as disputed?',
    payoutsEmpty: 'No settlements match this filter',
    reasonRequired: 'A reason is required.',
  },
  merchantsOps: {
    title: 'Merchants',
    subtitle: 'Understand, moderate, and analyze your merchants.',
    tabOverview: 'Overview', tabDirectory: 'Directory',
    kpiTotal: 'Total merchants', kpiActive: 'Active', kpiPaused: 'Paused', kpiSuspended: 'Suspended', kpiArchived: 'Archived',
    kpiFree: 'Free tier', kpiGrowth: 'Growth tier', kpiNew: 'New this period', kpiMissionsLive: 'Live missions', kpiSettlementsPending: 'Settlements pending',
    trendSignups: 'Merchant signups', trendMissions: 'Missions created', trendEmpty: 'No data in this period',
    leaderboardTitle: 'Top merchants', leaderboardEmpty: 'No merchants yet', lbMissions: 'missions', lbCreators: 'creators',
    atRiskTitle: 'At-risk merchants', atRiskEmpty: 'No at-risk merchants',
    reasonGrowthIdle: 'Growth tier, no live missions', reasonDisputed: 'Disputed settlement', reasonPendingOverdue: 'Settlement overdue',
    activityTitle: 'Recent moderation activity', activityEmpty: 'No moderation activity yet',
    dirSearch: 'Search company name', dirStatus: 'Status', dirTier: 'Tier', dirAll: 'All',
    dirLoadMore: 'Next page', dirEmpty: 'No merchants match your filters',
    colName: 'Merchant', colStatus: 'Status', colTier: 'Tier', colJoined: 'Joined', colActions: 'Actions',
    statusActive: 'Active', statusPaused: 'Paused', statusSuspended: 'Suspended', statusArchived: 'Archived',
    tierFree: 'Free', tierGrowth: 'Growth',
    actSetStatus: 'Set status', actSetTier: 'Set tier', actNote: 'Add note', actApply: 'Apply', actCancel: 'Cancel',
    reasonPlaceholder: 'Reason (required)', notePlaceholder: 'Note (required)',
    confirmArchive: 'Archive this merchant? Their missions are affected.',
    bulkApply: 'Apply to selected', bulkSelected: 'selected', bulkChooseAction: 'Choose a status',
    actionFailed: 'Action failed. Try again.',
  },
  perks: {
    catalog: {
      heading: 'Creator perks', subtitle: 'Partner deals unlocked by your contribution tier.',
      empty: 'No perks available yet — check back soon.',
      lockedBadge: 'Locked', requiresTier: 'Requires {tier}', unlockCta: 'Climb your tier',
      redeem: 'Redeem', redeemed: 'Redeemed', reveal: 'Reveal', hide: 'Hide',
      copyCode: 'Copy code', copied: 'Copied', openDeal: 'Open deal',
      redeemFailed: 'Could not redeem this perk. Please try again.',
    },
    admin: {
      title: 'Perks', subtitle: 'Create and manage partner perks.',
      newPerk: 'New perk', editPerk: 'Edit perk', empty: 'No perks yet. Create the first one.',
      fieldPartner: 'Partner name', fieldTitle: 'Title', fieldSummary: 'Summary', fieldCategory: 'Category',
      fieldDiscount: 'Discount label', fieldMinTier: 'Minimum tier', fieldRedemptionType: 'Redemption type',
      fieldRedemptionValue: 'Redemption value', fieldSortOrder: 'Sort order', fieldActive: 'Active',
      tierOpen: 'Open to all', tierRising: 'Rising', tierPro: 'Pro', tierElite: 'Elite',
      typeCode: 'Code', typeLink: 'Link',
      save: 'Save', cancel: 'Cancel', activate: 'Activate', deactivate: 'Deactivate',
      statusActive: 'Active', statusInactive: 'Inactive',
    },
    tierLabels: { rising: 'Rising', pro: 'Pro', elite: 'Elite' },
  },
  users: {
    title: 'Users',
    subtitle: 'Manage creators, merchants, and ops members.',
    sectionCreators: 'Creators',
    sectionMerchants: 'Merchants',
    sectionOps: 'Ops members',
    empty: 'None yet.',
    joined: 'Joined',
    unnamed: 'Unnamed',
    activate: 'Activate',
    suspend: 'Suspend',
    statusActive: 'Active',
    statusSuspended: 'Suspended',
    statusOnboarding: 'Onboarding',
    statusPaused: 'Paused',
    statusArchived: 'Archived',
    errorGeneric: 'User status could not be changed.',
    tierLabel: 'Tier',
    tierFree: 'Free',
    tierGrowth: 'Growth',
  },
  merchantSearch: {
    heading: 'Find creators',
    sub: 'Discover creators by what they publicly share — niches, audience regions, languages, and platforms.',
    searchPlaceholder: 'Search by name or handle…',
    filter: 'Filters',
    filtersLocked: 'Filters are available on Growth.',
    upgradeTitle: 'Upgrade to Growth',
    upgradeBlurb: 'Unlock filters, see every matching creator, and send more invitations.',
    upgradeCta: 'Upgrade',
    tabRecommended: 'Recommended',
    tabSaved: 'Saved',
    tabWorking: 'Working with',
    emptyRecommended: 'No creators match your filters yet.',
    emptySaved: 'You haven’t saved any creators yet.',
    emptyWorking: 'No creators are working with you yet.',
    resultsCapped: 'Showing your top matches. Upgrade to Growth to see them all.',
    invitesLeft: '{count} invitations left this month',
    reasonNiche: 'Niche match',
    reasonGeo: 'Audience region match',
    reasonLanguage: 'Language match',
    reasonPlatform: 'Platform match',
    guidesLabel: '{count} Guides',
    viewProfile: 'View profile',
    save: 'Save',
    saved: 'Saved',
    sendBrief: 'Send brief',
    addNote: 'Add a private note…',
    pickMissionTitle: 'Invite to a mission',
    pickMissionEmpty: 'Publish a mission first to invite creators.',
    invited: 'Invited',
    filterNiches: 'Niches',
    filterGeos: 'Audience regions',
    filterLanguages: 'Languages',
    filterPlatforms: 'Platforms',
    filterHasGuides: 'Has published guides',
    inviteQuotaExceeded: 'You’ve used all your invitations this month.',
    alreadyParticipant: 'This creator is already part of that mission.',
    inviteFailed: 'Could not send the invitation. Please try again.',
  },
  insights: {
    navLabel: 'Insights',
    empty: 'No activity yet.',
    creatorTitle: 'Your insights',
    creatorSubtitle: 'Your real activity on KINNSO. These are contribution points from your work — not money.',
    pointsTotal: 'Contribution points',
    pointsTrajectory: 'Points over the last 12 weeks',
    pointsByType: 'Where your points come from',
    typeGuide: 'Published guides',
    typeMission: 'Verified missions',
    typeScan: 'DNA scan',
    tierProgress: 'Tier progress',
    tierAtMax: 'Top tier reached',
    pointsToNext: '{points} points to {tier}',
    guidesPublished: 'Published guides',
    guideSaves: 'Total saves',
    missionsTitle: 'Your missions',
    statusApplied: 'Applied',
    statusActive: 'Active',
    statusInvited: 'Invited',
    statusRejected: 'Not selected',
    deliverables: 'Approved deliverables',
    creatorEmptyPoints: 'Publish your first guide or complete a mission to start earning points.',
    creatorEmptyMissions: 'No mission activity yet. Browse open missions in your studio.',
    merchantTitle: 'Campaign insights',
    merchantSubtitle: 'Activity across the missions you have posted.',
    missionsPublished: 'Published missions',
    participants: 'Total participants',
    inviteAcceptRate: 'Invite acceptance',
    deliveredWork: 'Approved deliverables',
    perMissionTitle: 'By mission',
    colMission: 'Mission',
    colInvited: 'Invited',
    colApplied: 'Applied',
    colActive: 'Active',
    colRejected: 'Rejected',
    colDelivered: 'Delivered',
    merchantEmpty: 'Post a mission to start seeing campaign activity.',
    notApplicable: '—',
  },
}
export default messages

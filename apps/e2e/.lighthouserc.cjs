const base = process.env.E2E_BASE_URL || 'https://remix-kinnso-web.vercel.app'

// Warnings-first: budgets are 'warn' so CWV readings are produced without failing the job.
// To promote to a hard gate later, change a budget's first element from 'warn' to 'error'.
module.exports = {
  ci: {
    collect: {
      url: [
        `${base}/en/articles/dining/ramen-guide`, // flagship detail
        `${base}/en/articles/dining`, // listing
        `${base}/en/articles`, // hub
      ],
      numberOfRuns: 1,
    },
    assert: {
      assertions: {
        'largest-contentful-paint': ['warn', { maxNumericValue: 2500 }],
        'total-blocking-time': ['warn', { maxNumericValue: 300 }],
        'cumulative-layout-shift': ['warn', { maxNumericValue: 0.1 }],
        'first-contentful-paint': ['warn', { maxNumericValue: 2000 }],
      },
    },
    upload: { target: 'temporary-public-storage' },
  },
}

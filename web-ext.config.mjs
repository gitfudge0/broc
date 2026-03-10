// web-ext configuration
// Docs: https://extensionworkshop.com/documentation/develop/web-ext-command-reference/

export default {
  run: {
    // Browser binary — override with FIREFOX env var (e.g. FIREFOX=/usr/bin/firefox-nightly)
    firefox: process.env.FIREFOX || "firefox",

    // Skip all first-run / welcome / telemetry UI so the browser opens clean
    pref: [
      // Disable telemetry consent dialog
      "datareporting.policy.dataSubmissionEnabled=false",
      "toolkit.telemetry.reportingpolicy.firstRun=false",

      // Don't ask to be default browser
      "browser.shell.checkDefaultBrowser=false",
      "browser.shell.didSkipDefaultBrowserCheckOnFirstRun=true",

      // Skip "What's New" / post-update page
      "browser.startup.homepage_override.mstone=ignore",

      // Suppress welcome page(s)
      "startup.homepage_welcome_url=about:blank",
      "startup.homepage_welcome_url.additional=",
      "browser.startup.firstrunSkipsHomepage=true",

      // Disable about:welcome onboarding
      "browser.aboutwelcome.enabled=false",
      "trailhead.firstrun.didSeeAboutWelcome=true",

      // Don't show "Firefox Privacy Notice" / rights info bar
      "browser.rights.3.shown=true",
      "datareporting.policy.dataSubmissionPolicyBypassNotification=true",

      // Skip upgrade dialog
      "browser.startup.upgradeDialog.enabled=false",

      // Skip DNS-over-HTTPS first-run
      "doh-rollout.doneFirstRun=true",

      // Disable default browser agent (Windows) and background tasks
      "default-browser-agent.enabled=false",

      // Disable import wizard on first run
      "browser.migration.automigrate.enabled=false",
    ],
  },
};

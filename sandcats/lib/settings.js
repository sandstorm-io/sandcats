// This contains a schema that, through code, documents what settings
// are required.
var settingsSchema = new SimpleSchema({

  // The domain we are acting as a DNS service for. We use this on
  // startup to make sure that the zone exists in PowerDNS's
  // configuration, and we use it to generate hostnames so that when
  // users say they want the domain 'foo', we generate
  // e.g. 'foo.example.com'.
  BASE_DOMAIN: {
    type: String
  },

  // The primary nameserver of the domain name we're the DNS service
  // for. We use this to generate a reasonable SOA record and in the
  // NS records.
  NS1_HOSTNAME: {
    type: String
  },

  // Similar to NS1_HOSTNAME.
  NS2_HOSTNAME: {
    type: String
  },

  // IP address of first nameserver for the domain, which is also used
  // as IP address for the apex of the domain.
  NS1_IP_ADDRESS: {
    type: String
  },

  // Username for connecting to MySQL for PowerDNS.
  POWERDNS_USER: {
    type: String
  },

  // Password for the above.
  POWERDNS_PASSWORD: {
    type: String
  },

  // Database name for the above.
  POWERDNS_DB: {
    type: String
  },

  // Port number for UDP-based ping system.
  UDP_PING_PORT: {
    type: Number
  },

  // In production, the URL of the root. Auto-detected in dev,
  // therefore optional here.
  ROOT_URL: {
    type: String,
    optional: true
  },

  // When we send emails out for account recovery, we need to use some
  // kind of "From:" address. Here is where we store that.
  EMAIL_FROM_ADDRESS: {
    type: String,
  },

  // When we make API calls to GlobalSign, we need to use a username
  // and password. The username is not a secret; the password is. It
  // is permissible to run this code without the GlobalSign username
  // configured.
  //
  // This setting occurs in both DEV_ and PROD_ form.
  GLOBALSIGN_DEV_USERNAME: {
    type: String,
    optional: true
  },

  GLOBALSIGN_PROD_USERNAME: {
    type: String,
    optional: true
  },

  // API calls to GlobalSign are with regard to a particular domain
  // name. This setting configures which domain to use. It's separate
  // from BASE_DOMAIN because the DNS domain we use for testing is
  // not the same as the GlobalSign domain that we use for testing.
  GLOBALSIGN_DOMAIN: {
    type: String,
    optional: true
  },

  // A list of hostnames that will always use the GlobalSign dev API.
  // These hostnames can use always use the GlobalSign dev API to get
  // certificates.
  GLOBALSIGN_DEV_HOSTNAMES: {
    type: [String]
  },

  // A list of hostnames that will always use the GlobalSign
  // production API. They can use the production GlobalSign API no
  // matter if dev or prod is the default.
  GLOBALSIGN_PROD_HOSTNAMES: {
    type: [String]
  },

  // API calls to GlobalSign can use their testing API ("dev") or
  // their live API ("prod"). This specifies the default.
  //
  // It is safe to set this to "dev" even if you don't want GlobalSign
  // integration to work on your particular Sandcats install. It may
  // result in some runtime exceptions, but nothing too bad.
  GLOBALSIGN_DEFAULT: {
    type: String,
    allowedValues: ["dev", "prod"]
  },

  // A list of strings of email addresses to send daily GlobalSign
  // usage reports to. This is required, but you can set it to the
  // empty list.
  DAILY_REPORT_RECIPIENTS: {
    type: [String]
  },

  // A list of strings of email addresses to send the "weekly report"
  // (Monday's daily report) to. This is required, but you can set it
  // to the empty list.
  WEEKLY_REPORT_RECIPIENTS: {
    type: [String]
  },

  DAILY_REPORT_DONT_ACTUALLY_SEND: {
    type: Boolean,
    optional: true
  }
});

// A function for the app to call when it starts so that it can
// validate that all the required settings are present.
validateSettings = function() {
  check(Meteor.settings, settingsSchema);
};

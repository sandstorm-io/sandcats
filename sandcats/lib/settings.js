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
  }
});

// A function for the app to call when it starts so that it can
// validate that all the required settings are present.
validateSettings = function() {
  check(Meteor.settings, settingsSchema);
};

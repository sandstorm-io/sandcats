// Provide a "public key must be unique" rule, for validating the public key. Mesosphere handles
// making sure it is the right length.
Mesosphere.registerRule('keyFingerprintUnique', function (fieldValue, ruleValue) {
  if (! ruleValue) {
    // if the user does something like pubkeyUnique:
    // false, they don't need us to validate.
    return true;
  }

  // Make sure there is no one else registered with this fingerprint.
  if (UserRegistrations.findOne({publicKeyId: fieldValue})) {
    return false;
  }

  // Everything seems okay!
  return true;
});

// Add extra constraints about hyphen use: can't start with a hyphen; can't end with a hyphen; can't
// have two hyphens next to each other.
Mesosphere.registerRule('extraHyphenRegexes', function (fieldValue, ruleValue) {
  if (! ruleValue) {
    // if the user does something like extraHyphenRegexes: false, they don't need us to validate.
    return true;
  }

  // Reject start with hyphen;
  if (fieldValue.match(/^-/)) {
    return false;
  }

  // Reject end with a hyphen.
  if (fieldValue.match(/-$/)) {
    return false;
  }

  // Reject two hyphens next to each other.
  if (fieldValue.match(/--/)) {
    return false;
  }

  // Seems OK!
  return true;
});

Mesosphere.registerAggregate('domainExistsSoCanBeRecovered', function(fields, formFieldsObject) {
  // Sending a recovery token only makes sense if the hostname
  // actually exists.
  var userRegistration = UserRegistrations.findOne({'hostname': formFieldsObject.rawHostname});

  // Take that userRegistration and "cast it to a boolean", Javascript style.
  return !! userRegistration;
});

function commonNameMatchesHostname(csr, rawHostname) {
  var commonNameFromCsr = getCommonNameFromCsr(csr);
  console.log("Found common name:", JSON.stringify(commonNameFromCsr));

  var baseDomainWithDot = "." + Meteor.settings.GLOBALSIGN_DOMAIN;

  // Verify that the hostname ends in the currently-configured domain for
  // GlobalSign.
  if (! _.endsWith(commonNameFromCsr, baseDomainWithDot)) {
    console.log("Seems that", commonNameFromCsr, "does not end with", baseDomainWithDot);
    return false;
  }

  // Remove exactly one reference of that from the end.
  var hostnameFromCsr = commonNameFromCsr.slice(
    0, commonNameFromCsr.lastIndexOf(baseDomainWithDot));

  // This converts the hostname on both sides to lowercase, doing
  // a case-insensitive comparison.
  var hostnameToCheck = rawHostname.toLowerCase();
  var csrHostnameToCheck = hostnameFromCsr.toLowerCase();

  if (hostnameToCheck === csrHostnameToCheck) {
    return true;
  }

  if (('*.' + hostnameToCheck) === csrHostnameToCheck) {
    return true;
  }

  console.log("In commonNameMatchesHostname:", hostnameToCheck, "!=", csrHostnameToCheck);
  return false;
}

function hostnameIsWithinReasonableCertificateIssuanceLimits(hostname) {
  // Return if it makes sense for this hostname to ask for another certificate.
  //
  // Definition of "makes sense":
  //
  // Look at all the CertificateRequests objects we have made for this
  // hostname. If the user has >= 4 currently valid certificates,
  // refuse to issue more.
  //
  // A currently-valid certificate is one where now >= StartDate
  // and EndDate >= now.
  //
  // We only look for CertificateRequests objects that have a
  // globalsignCertificateInfo attribute, since that's how we know
  // they're properly issued.
  var matches = CertificateRequests.find({
    'hostname': hostname,
    globalsignCertificateInfo: {$exists: true}
  });
  var currentlyValidCertificateCount = 0;
  var now = new Date();
  matches.forEach(function(doc) {
    var startDate = new Date(doc.globalsignCertificateInfo.StartDate);
    var endDate = new Date(doc.globalsignCertificateInfo.EndDate);
    if ((now >= startDate)  &&
        (endDate >= now)) {
      currentlyValidCertificateCount += 1;
    }
  });

  console.log("Found", currentlyValidCertificateCount, "certs for", hostname);

  if (currentlyValidCertificateCount >= 4) {
    // too many!
    return false;
  }

  return true;
}

Mesosphere.registerAggregate('getCertificateIsAuthorized', function(fields, formFieldsObject) {
  var csr = formFieldsObject.certificateSigningRequest;
  if (!csr) {
    return false;
  }

  var pubkey = formFieldsObject.pubkey;
  var hostname = formFieldsObject.rawHostname;

  if (! _hostnameAndPubkeyMatch(pubkey, hostname)) {
    return false;
  }


  if ( ! commonNameMatchesHostname(csr, hostname)) {
    return false;
  }

  return hostnameIsWithinReasonableCertificateIssuanceLimits(hostname);
});

makeTokenExpirationChecker = function(maxStalenessInSeconds) {
  return function(recoveryData) {
    var staleness_ms = Date.now() - recoveryData.timestamp.getTime();
    var staleness = Math.floor(staleness_ms / 1000);
    if (staleness > maxStalenessInSeconds) {
      return false;
    }
    return true;
  };
};

recoveryDataHasAcceptableStaleness = makeTokenExpirationChecker(RECOVERY_TIME_PERIOD_IN_SECONDS);

Mesosphere.registerAggregate('recoveryIsAuthorized', function(fields, formFieldsObject) {
  // Recovery is authorized under the following circumstances.
  //
  // - The domain in question has an entry in UserRegistrations.
  //
  // - The object has a recoveryData attribute.
  //
  // - The recoveryData's timestamp is less than
  //   RECOVERY_TIME_PERIOD_IN_SECONDS old.
  //
  // - The recoveryToken we are given is the same as the one in the
  //   recoveryData.
  var userRegistration = UserRegistrations.findOne({'hostname': formFieldsObject.rawHostname});

  if (! userRegistration) {
    return false;
  }

  var recoveryData = userRegistration.recoveryData;
  if (! recoveryData) {
    return false;
  }

  if (! recoveryDataHasAcceptableStaleness(recoveryData)) {
    return false;
  }

  if (formFieldsObject.recoveryToken == recoveryData.recoveryToken) {
    return true;  // hooray!
  }

  return false;
});

function _hostnameAndPubkeyMatch(pubkey, hostname) {
  if (UserRegistrations.findOne({publicKeyId: pubkey,
                                 hostname: hostname})) {
    // This means we have a match. Hooray!
    return true;
  }

  // By default, do not permit the update.
  console.log("Rejecting access to hostname", hostname, "from pubkey", pubkey);
  return false;
}

Mesosphere.registerAggregate('hostnameAndPubkeyMatch', function(fields, formFieldsObject) {
  var pubkey = formFieldsObject.pubkey;
  var hostname = formFieldsObject.rawHostname;

  return _hostnameAndPubkeyMatch(pubkey, hostname);
});

var RECOVERY_TIME_PERIOD_IN_SECONDS = 15 * 60;
function makeOkToSendRecoveryToken() {
  // The purpose of this function is to ensure that we don't send
  // recovery tokens to users too frequently.
  //
  // To achieve that, we make a closure that contains information
  // about recent times we sent recovery tokens. If the server stops
  // and starts, yeah, we'll lose this info, but the
  // RECOVERY_TIME_PERIOD_IN_MINUTES is a pretty short window, and we restart
  // the server pretty infrequently, so I'm not super worried about
  // that.
  var recoveryTokenSendTimesByHostname = {};

  var MAX_SENDS_PER_TIME_PERIOD = 2;

  // TODO: Make this use a heap. We could then have a garbage
  // collection strategy involving a heap (sorted by date of
  // insertion) and keeping a linear list of the hosts where password
  // resets were sent.
  //
  // For now, let's just do no garbage collection on this at all, and
  // assume that server restarts will save us.

  return function(fields, formFieldsObject) {
    var hostname = formFieldsObject.rawHostname;

    // We need the current time (in UNIX epoch seconds) in a few
    // places.
    var now = Math.floor(new Date().getTime() / 1000);

    // If no one has requested a reset on this ever, then let's add a
    // note indicating when the reset was done, and say it's OK.
    if (! recoveryTokenSendTimesByHostname[hostname]) {
      recoveryTokenSendTimesByHostname[hostname] = [now];
      return true;
    }

    // If someone has ever requested this domain, loop through the
    // list of requests and count the number that occurred in the past
    // RECOVERY_TIME_PERIOD_IN_SECONDS. If it's greater than that,
    // refuse to send.
    var relevantTimes = recoveryTokenSendTimesByHostname[hostname];

    // This value starts at 1 because we have not yet pushed this
    // request into the array. We will push it into the array if
    // we would return true.
    var numberOfRecentRecoveryTokenRequests = 1;

    for (var i = 0 ; i < relevantTimes.length; i++) {
      var difference = now - relevantTimes[i];
      if (difference <= RECOVERY_TIME_PERIOD_IN_SECONDS) {
        numberOfRecentRecoveryTokenRequests += 1;
      }
    }

    // If numberOfRecentRecoveryTokenRequests is greater than
    // MAX_SENDS_PER_TIME_PERIOD, then scrupulously refuse to send.
    if (numberOfRecentRecoveryTokenRequests > MAX_SENDS_PER_TIME_PERIOD) {
      return false;
    }

    // Well, things seem OK then. Let's add ourselves to the array so
    // that we count this request next time.
    recoveryTokenSendTimesByHostname[hostname].push(now);
    return true;
  }
};

Mesosphere.registerAggregate('okToSendRecoveryToken', makeOkToSendRecoveryToken());

Mesosphere.registerRule('ipAddressNotOverused', function (fieldValue, ruleValue) {
  var MAX_IP_REGISTRATIONS = 20;

  if (! ruleValue) {
    // if the user includes us but sets the validation to false,
    // they don't need us to validate.
    return true;
  }

  // Mesosphere will make sure this is a valid IP address.
  //
  // Therefore, our job is to query the data store to see if this IP
  // address is registered too many times.
  //
  // FIXME: Implement.
  return true;
});

// We need to calculate a hostname that this user is authorized to
// use. The rules are a little complicated. They are:
//
// - The hostname should be >= 1 character. We delegate checking
//   this to Mesosphere.
//
// - If the hostname is not taken, then sure, the user can have it.
//
// That's all for now. This means that with this implementation, the
// user can't change the IP address they register. We'll add that
// later.
//
// Doing the future version will require more information than just
// the hostname, so we would then stop using rawHostname and start
// presumably using a Mesosophere aggregate called validatedHostname.
Mesosphere.registerRule('hostnameUnused', function (fieldValue, ruleValue) {
  if (! ruleValue) {
    // if the user includes us but sets the validation to false,
    // they don't need us to validate.
    return true;
  }

  // If Mongo says the hostname is used, then block this registration.
  if (UserRegistrations.findOne({hostname: fieldValue})) {
    return false;
  }

  // If the hostname is pre-reserved, then block this registration.
  if (DomainReservations.findOne({hostname: fieldValue})) {
    return false;
  }

  // Here we block some well-known hostnames; see full discussion in
  // issue #43.
  var wellKnownHostnames = /^(www|mail|email|smtp|mx|ns[0-9]|ftp)$/;
  var adminEsqueUsernames = /^(root|admin|administrator|owner|sys|system|domainadmin|domainadministrator)$/;
  var rfc2142EmailAddresses = /^(hostmaster|postmaster|usenet|news|webmaster|www|uucp|ftp|abuse|noc|security|info|marketing|sales|support)$/;
  var caOwnershipEmails = /^(ssladmin|ssladministrator|sslwebmaster|sysadmin|is|it|mis)$/;
  var otherCommonEmails = /^(noreply|no-reply|community|mailerdaemon|mailer-daemon|nobody)$/;
  var sandstormSpecific = /^(sandcat|sandcats|sandstorm|blackrock|capnproto|capnp|garply|asheesh|paulproteus|jade|qiqing|kenton|kentonv|jason|jparyani|david|dwrensha|oasis|example)$/;
  var powerfulHostnames = /^(wpad|isatap)$/;
  var emailAutoconfigHostnames = /^(autoconfig|imap|pop|pop3)$/;
  var localhostAndFriends = /^(localhost|localdomain|broadcasthost|_tcp|_udp)$/;
  if (wellKnownHostnames.test(fieldValue) ||
      adminEsqueUsernames.test(fieldValue) ||
      rfc2142EmailAddresses.test(fieldValue) ||
      caOwnershipEmails.test(fieldValue) ||
      otherCommonEmails.test(fieldValue) ||
      sandstormSpecific.test(fieldValue) ||
      powerfulHostnames.test(fieldValue) ||
      emailAutoconfigHostnames.test(fieldValue) ||
      localhostAndFriends.test(fieldValue)) {
    console.log("Blocked the use of hostname " + fieldValue);
    return false;
  }

  // This is in theory race-condition-able. For now I think that's
  // life.
  return true;
});

// Create Mesosphere.registerForm validator. The use of custom
// validation rules combimes the Sandcats-specific logic with the
// data validation so that we can do it all in one call.
Mesosphere({
  name: 'registerForm',
  fields: {
    rawHostname: {
      required: true,
      format: /^[0-9a-zA-Z-]+$/,
      transforms: ["clean", "toLowerCase"],
      rules: {
        minLength: 1,
        maxLength: 20,
        hostnameUnused: true,
        extraHyphenRegexes: true,
      }
    },
    certificateSigningRequest: {
      required: false
    },
    ipAddress: {
      required: true,
      format: "ipv4",
      rules: {
        ipAddressNotOverused: true
      }
    },
    email: {
      required: true,
      format: "email"
    },
    pubkey: {
      required: true,
      rules: {
        minLength: 40,
        maxLength: 40,
        keyFingerprintUnique: true
      },
    }
  }
});

// Create reserveForm validator.
// TODO:
// - Make sure you can't reserve a domain that already has a UserRegistration.
// - Make sure you can't reserve a domain that already has a DomainReservation.
// - Make sure you can't register a domain that already has a DomainReservation.
Mesosphere({
  name: 'reserveForm',
  fields: {
    rawHostname: {
      required: true,
      format: /^[0-9a-zA-Z-]+$/,
      transforms: ["clean", "toLowerCase"],
      rules: {
        minLength: 1,
        maxLength: 20,
        hostnameUnused: true,
        extraHyphenRegexes: true,
      }
    },
    email: {
      required: true,
      format: "email"
    }
  },
  aggregates: {
    updateIsAuthorized: ['hostnameAndPubkeyMatch', ['rawHostname', 'pubkey']]
  }
});

// Create validator for an IP address update request.
Mesosphere({
  name: 'updateForm',
  fields: {
    rawHostname: {
      required: true,
      format: /^[0-9a-zA-Z-]+$/,
      transforms: ["clean", "toLowerCase"],
      rules: {
        minLength: 1,
        maxLength: 20
      }
    },
    ipAddress: {
      required: true,
      format: "ipv4",
      rules: {
        ipAddressNotOverused: true
      }
    },
    pubkey: {
      required: true,
      rules: {
        minLength: 40,
        maxLength: 40,
      }
    }
  },
  aggregates: {
    updateIsAuthorized: ['hostnameAndPubkeyMatch', ['rawHostname', 'pubkey']]
  }
});

// Create validator for a request that we sign a CSR.
Mesosphere({
  name: 'getCertificate',
  fields: {
    rawHostname: {
      required: true,
      format: /^[0-9a-zA-Z-]+$/,
      transforms: ["clean", "toLowerCase"],
      rules: {
        minLength: 1,
        maxLength: 20
      }
    },
    certificateSigningRequest: {
      required: true
    },
    pubkey: {
      required: true,
      rules: {
        minLength: 40,
        maxLength: 40
      },
    }
  },
  aggregates: {
    isAuthorized: ['getCertificateIsAuthorized', ['pubkey', 'rawHostname', 'certificateSigningRequest']]
  }
});

// Create validator for recovery token sending request.
Mesosphere({
  name: 'recoverDomainForm',
  fields: {
    recoveryToken: {
      required: true,
      format: /^[0-9a-zA-Z-]+$/,
      rules: {
        minLength: 40,
        maxLength: 40
      },
    },
    rawHostname: {
      required: true,
      format: /^[0-9a-zA-Z-]+$/,
      transforms: ["clean", "toLowerCase"],
      rules: {
        minLength: 1,
        maxLength: 20
      }
    },
    pubkey: {
      required: true,
      rules: {
        minLength: 40,
        maxLength: 40,
        keyFingerprintUnique: true
      },
    }
  },
  aggregates: {
    recoveryIsAuthorized: ['recoveryIsAuthorized', ['rawHostname', 'recoveryToken']]
  }
});

// Create validator for recovery token sending request.
Mesosphere({
  name: 'recoverytokenForm',
  fields: {
    rawHostname: {
      required: true,
      format: /^[0-9a-zA-Z-]+$/,
      transforms: ["clean", "toLowerCase"],
      rules: {
        minLength: 1,
        maxLength: 20
      }
    },

  },
  aggregates: {
    okToSendRecoveryToken: ['okToSendRecoveryToken', ['rawHostname']],
    domainExistsSoCanBeRecovered: ['domainExistsSoCanBeRecovered', ['rawHostname']]
  }
});

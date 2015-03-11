// Provide a "public key must be unique" rule, for validating the
// public key. Mesosphere handles making sure it is the right length.
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

Mesosphere.registerAggregate('hostnameAndPubkeyMatch', function(fields, formFieldsObject) {
  var pubkey = formFieldsObject.pubkey;
  var hostname = formFieldsObject.rawHostname;

  if (UserRegistrations.findOne({publicKeyId: pubkey,
                                 hostname: hostname})) {
    // This means we have a match. Hooray!
    return true;
  }

  // By default, do not permit the update.
  return false;
});

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
      format: /^[0-9a-zA-Z]+$/,
      transforms: ["clean", "toLowerCase"],
      rules: {
        minLength: 1,
        maxLength: 20,
        hostnameUnused: true
      }
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

// Create validator for an IP address update request.
Mesosphere({
  name: 'updateForm',
  fields: {
    rawHostname: {
      required: true,
      format: /^[0-9a-zA-Z]+$/,
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

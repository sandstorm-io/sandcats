UserRegistrations = new Mongo.Collection("userRegistrations");
Schemas = {};
SimpleSchema.debug = true;
Schemas.UserRegistrations = new SimpleSchema({
  hostname: {
    type: String,
    max: 20,
    min: 1
  },
  ipAddress: {
    // We use a String here for convenience. We rely on Mesosphere to
    // validate that this is actually an IP address.
    //
    // Note that we currently only support IPv4.
    type: String,
    max: 15,
    min: 1
    // FIXME: Somewhere we might want to make sure this is not a
    // "private IP"? Or not. Maybe we don't care.
  },
  fullPublicKeyPem: {
    // We rely on Mesosphere to validate that this is actually a
    // public key in PEM format.
    type: String
  },
  publicKeyId: {
    type: String,
    min: 40,
    max: 40
  },
  emailAddress: {
    // We use a string here for convenience. We rely on Mesosphere to
    // validate that this is actually an email address.
    type: String
  }
});

UserRegistrations.attachSchema(Schemas.UserRegistrations);

if (Meteor.isServer) {
  // Create global constants that come from environment variables.
  BASE_DOMAIN = process.env.BASE_DOMAIN;
  if (! BASE_DOMAIN) {
    throw "Need to provide BASE_DOMAIN as environment variable.";
  }
  NS1_HOSTNAME = process.env.NS1_HOSTNAME;
  if (! NS1_HOSTNAME) {
    throw "Need to provide fully-qualified hostname for first nameserver as NS1_HOSTNAME environment variable.";
  }
  NS2_HOSTNAME = process.env.NS2_HOSTNAME;
  if (! NS2_HOSTNAME) {
    throw "Need to provide fully-qualified hostname for second nameserver as NS2_HOSTNAME environment variable.";
  }

  // PEM file utility functions.
  forge = Meteor.npmRequire('node-forge');
  fs = Meteor.npmRequire('fs');
  pemToPublicKeyFingerprint = function(pemBytes) {
    return forge.pki.getPublicKeyFingerprint(forge.pki.publicKeyFromPem(pemBytes),
                                             {encoding: 'hex'});
  };
  pemToPublicKeyOrFalse = function(pemBytes) {
    try {
      var dummyKeyObject = forge.pki.publicKeyFromPem(pemBytes);
      if (dummyKeyObject) {
        return true;
      }
    }
    catch (err) {
      console.log("While validating PEM public key, triggered error: " + err);
    }
    return false;
  };

  // Provide a "public key must be unique" rule, for validating
  // the public key.
  Mesosphere.registerRule('pubkeyValidAndUnique', function (fieldValue, ruleValue) {
    if (! ruleValue) {
      // if the user does something like pubkeyUnique:
      // false, they don't need us to validate.
      return true;
    }

    // First, make sure it is a valid pubkey.
    if (! isValidPublicKey(fieldValue)) {
      return false;
    }

    // Second, make sure it is actually unique.
    var fingerprint = pemToPublicKeyFingerprint(fieldValue);

    if (UserRegistrations.findOne({publicKeyId: fingerprint})) {
      return false;
    }

    // Everything seems okay!
    return true;
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

    // FIXME: query Mongo to find out if this hostname is available. If so, then
    // great! Allow it to be allocated.
    //
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
          pubkeyValidAndUnique: true
        }
      }
    }
  });

  deleteRecordIfExists = function (wrappedQuery, domain, bareHost) {
    // Note that this deletes *all* records for this host, of any type
    // or content.
    //
    // It takes care of deleting the wildcard record, too.

    if (! bareHost || bareHost.match(/[.]/)) {
      throw "bareHost needs to be a string with no dot inside it.";
    }

    var hosts = [
      bareHost + '.' + domain,
      '*.' + bareHost + '.' + domain];

    for (var hostIndex = 0; hostIndex < hosts.length; hostIndex++) {
      host = hosts[hostIndex];

      var wrappedQuery = Meteor.wrapAsync(mysqlConnection.query, mysqlConnection);

      var result = wrappedQuery(
        "DELETE from `records` WHERE (domain_id = (SELECT `id` from `domains` WHERE `name` = ?)) AND "
          + "name = ?",
        [domain, host]);
      console.log("Successfully deleted record(s) for " + host + "." + "with status " + JSON.stringify(result) + ".");
    }
  };

  createRecord = function(mysqlConnection, domain, host, type, content) {
    mysqlConnection.query(
      "INSERT INTO records (domain_id, name, type, content) VALUES ((SELECT id FROM domains WHERE domains.name = ?), ?, ?, ?);",
      [domain, host, type, content],
      function (err, result) {
        if (err) throw err;

        console.log("Successfully added " + host + " = " + content + " (" + type + ").");
      });
  };

  function formatSoaRecord(primaryNameServer, adminEmailUsingDots, secondsBeforeRefresh,
                           secondsBeforeRefreshRetry, secondsBeforeDiscardStaleCache,
                           negativeResultTtl) {
    return [primaryNameServer, adminEmailUsingDots, secondsBeforeRefresh,
            secondsBeforeRefreshRetry, secondsBeforeDiscardStaleCache,
            negativeResultTtl].join(" ");
  };

  function createUserRegistration(formData) {
    // To create a user registration, we mostly copy data from the form.
    // We do also need to store a public key "fingerprint", which for
    // now we calculated as deadbeaf.
    var publicKeyId = pemToPublicKeyFingerprint(formData.pubkey);

    var userRegistrationId = UserRegistrations.insert({
      hostname: formData.rawHostname,
      ipAddress: formData.ipAddress,
      fullPublicKeyPem: formData.pubkey,
      publicKeyId: publicKeyId,
      emailAddress: formData.email
    });

    var userRegistration = UserRegistrations.findOne({_id: userRegistrationId});

    // We also probably want to send a confirmation URL. FIXME.
    // Arguably we should do this with Meteor accounts. Hmm.

    // Now, publish the UserRegistration to DNS.
    console.log(JSON.stringify(userRegistration));
    publishOneUserRegistrationToDns(userRegistration.hostname,
                                    userRegistration.ipAddress);
  };

  function publishOneUserRegistrationToDns(hostname, ipAddress) {
    // Given a hostname, and an IP address, we set up wildcard
    // records accordingly in the PowerDNS database.
    //
    // Note that PowerDNS will cache DNS queries for ~20 seconds
    // (configurable) before it actually queries the SQL database to
    // find out what the new value is. This is on top of any TTL in
    // the DNS record itself, as I understand it.
    deleteRecordIfExists(connection, BASE_DOMAIN, hostname);

    createRecord(connection, BASE_DOMAIN, hostname + '.' + BASE_DOMAIN, 'A', ipAddress);
    createRecord(connection, BASE_DOMAIN, '*.' + hostname + '.' + BASE_DOMAIN, 'A', ipAddress);
  };

  function registerPostHandler(clientIp, request, response) {
    // Before validating the form, we add an IP address field to it.
    console.log("woweee, " + clientIp);
    var formData = _.clone(request.body); // copy
    formData.ipAddress = clientIp;

    var formData = Mesosphere.registerForm.validate(formData);
    if (formData.errors) {
      response.writeHead(400, {'Content-Type': 'text/json'});
      response.end(JSON.stringify(formData.errors));
      return;
    }

    // Great! It passed all our validation, including the
    // Sandcats-specific validation. In that case, let's store an item
    // in our Mongo collection and also update DNS.
    createUserRegistration(formData.formData);

    // in request.body, we will find a Javascript object
    response.writeHead(200, {'Content-Type': 'text/json'});
    response.end(JSON.stringify({'success': true}));
  };

  function createDomain(mysqlConnection, domain) {
    mysqlConnection.query(
      "INSERT INTO `domains` (name, type) VALUES (?, 'NATIVE');",
      [domain],
      function (error, result) {
        if (error) throw error;

        console.log("Created domain; it received ID #" + result.insertId);
        console.log("Creating records for top level...");
        createRecord(mysqlConnection, BASE_DOMAIN, BASE_DOMAIN, 'A', '127.0.0.1');
        createRecord(mysqlConnection, BASE_DOMAIN, BASE_DOMAIN, 'SOA', formatSoaRecord(
          // The SOA advertises the first nameserver.
          NS1_HOSTNAME,
          // It advertises hostmaster@BASE_DOMAIN as a contact email address.
          'hostmaster.' + BASE_DOMAIN,
          // For the rest of these, see formatSoaRecord()'s variable names.
          1,
          60,
          60,
          604800,
          60));
        createRecord(mysqlConnection, BASE_DOMAIN, BASE_DOMAIN, 'NS', NS1_HOSTNAME);
        createRecord(mysqlConnection, BASE_DOMAIN, BASE_DOMAIN, 'NS', NS2_HOSTNAME);
      });

  };

  connection = null;

  Meteor.startup(function () {

    // Make sure sandcats.io is in the list of domains.
    connection = Mysql.createConnection({
      host: 'localhost',
      user: process.env.POWERDNS_USER,
      database: process.env.POWERDNS_DB,
      password: process.env.POWERDNS_PASSWORD});
    connection.connect(function(err) {
      if (err) {
        throw new Error(err);
      }
    });

    connection.query(
      "SELECT name FROM `domains` WHERE name = ?",
      [BASE_DOMAIN],
      function(err, rows, fields) {
        if (err) throw Error(err);

        if (rows.length === 0) {
          console.log("Creating " + BASE_DOMAIN + "...");
          createDomain(connection, BASE_DOMAIN);
        }
      });

    Router.map(function() {
      this.route('register', {
        path: '/register',
        where: 'server',
        action: function() {
          // GET, POST, PUT, DELETE
          var requestMethod = this.request.method;
          if (this.request.method == 'PUT' ||
              this.request.method == 'POST') {
            var clientIp = this.request.connection.remoteAddress;
            registerPostHandler(clientIp, this.request, this.response);
          }
        }
      });
    // code to run on server at startup
  });

  })
}

if (Meteor.isClient) {
  // counter starts at 0
  Session.setDefault('counter', 0);

  Template.hello.helpers({
    counter: function () {
      return Session.get('counter');
    }
  });

  Template.hello.events({
    'click button': function () {
      // increment the counter when button is clicked
      Session.set('counter', Session.get('counter') + 1);
    }
  });
}

if (Meteor.isServer) {

  // Provide a "public key must be unique" rule, for validating
  // the public key.
  Mesosphere.registerRule('pubkeyValidAndUnique', function (fieldValue, ruleValue) {
    if (! ruleValue) {
      // if the user does something like pubkeyUnique:
      // false, they don't need us to validate.
      return true;
    }

    // First, make sure it is a valid pubkey.
    // Second, make sure it is actually unique.

    // FIXME: Add ursa's validation here?
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
  // validation rules combimes the Sancats-specific logic with the
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

  function registerPostHandler(clientIp, request, response) {
    response.writeHead(200, {'Content-Type': 'text/json'});
    // Before validating the form, we add an IP address field to it.
    console.log("woweee, " + clientIp);
    var formData = JSON.parse(JSON.stringify(request.body)); // copy
    formData.ipAddress = clientIp;

    var formData = Mesosphere.registerForm.validate(formData);
    if (formData.errors) {
      response.end(JSON.stringify(formData.errors));
      return;
    }

    // Great! We have a valid registration attempt. Let's store it, so
    // long as:
    //
    // - The IP address isn't registered >= 2 times (FIXME: 2 -> 20)
    // - The public key has never been used (FIXME: impl)
    // - The name is not used.

    // in request.body, we will find a Javascript object
    response.end('<html><body>Your request body was a ' + JSON.stringify(formData.formData) + '</body></html>');
  };

  function createDomain(mysqlConnection, domain) {
    mysqlConnection.query(
      "INSERT INTO `domains` (name, type) VALUES (?, 'NATIVE');",
      [domain],
      function (error, result) {
        if (error) throw err;

        console.log("Created domain; it received ID #" + result.insertId);
        console.log("Creating records for top level...");
        createRecord(mysqlConnection, 'sandcats.io', 'sandcats.io', 'A', '127.0.0.1');
        createRecord(mysqlConnection, 'sandcats.io', 'www.sandcats.io', 'A', '127.0.0.1');
        createRecord(mysqlConnection, 'sandcats.io', 'ns1.sandcats.io', 'A', '127.0.0.1');
        createRecord(mysqlConnection, 'sandcats.io', 'sandcats.io', 'SOA', formatSoaRecord(
          'sandcats-ns1.sandstorm.io',
          'sandcats-admin.sandstorm.io',
          1,
          60,
          60,
          604800,
          60));
        createRecord(mysqlConnection, 'sandcats.io', 'sandcats.io', 'NS', 'sandcats-ns1.sandstorm.io');
        createRecord(mysqlConnection, 'sandcats.io', 'sandcats.io', 'NS', 'sandcats-ns2.sandstorm.io');
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
      ["sandcats.io"],
      function(err, rows, fields) {
        if (err) throw Error(err);

        if (rows.length === 0) {
          console.log("Creating sandcats.io...");
          createDomain(connection, "sandcats.io");
        }
      });

    Router.map(function() {
      this.route('placeHolderName', {
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

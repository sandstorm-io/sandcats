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

  // Create Mesosphere.registerForm validator
  Mesosphere({
    name: 'registerForm',
    fields: {
      hostname: {
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
        format: "ipv4"
      },
      email: {
        required: true,
        format: "email"
      },
      pubkey: {
        required: true
        // FIXME: Add ursa's validation here?
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

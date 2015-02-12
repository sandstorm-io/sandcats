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

  function createRecord(mysqlConnection, domain, host, type, content) {
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
          'ns1.sandcats.io',
          'admin.sandcats.io',
          1,
          60,
          60,
          604800,
          60));
        console.log("Wow! Success.");
      });

  };

  var pdnsConfig = {
    adapter: 'mysql',
    user: process.env.POWERDNS_USER,
    db: process.env.POWERDNS_DB,
    password: process.env.POWERDNS_PASSWORD
  };
  pdns = Meteor.npmRequire('pdns')(pdnsConfig);

  Meteor.startup(function () {

    // Make sure sandcats.io is in the list of domains.
    var connection = Mysql.createConnection({
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

    // code to run on server at startup
  });
}

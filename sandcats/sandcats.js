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
          console.log("Need to create sandcats.io.");
        }
      });

    connection.end();
    // code to run on server at startup
  });
}

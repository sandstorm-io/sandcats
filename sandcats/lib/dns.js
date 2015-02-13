// Pure-function helpers.
function formatSoaRecord(primaryNameServer, adminEmailUsingDots, secondsBeforeRefresh,
                           secondsBeforeRefreshRetry, secondsBeforeDiscardStaleCache,
                           negativeResultTtl) {
  return [primaryNameServer, adminEmailUsingDots, secondsBeforeRefresh,
          secondsBeforeRefreshRetry, secondsBeforeDiscardStaleCache,
          negativeResultTtl].join(" ");
};

// Functions that communicate with the MySQL PowerDNS database.
createWrappedQuery = function() {
  var rawConnection =
      Mysql.createConnection({
        host: 'localhost',
        user: Meteor.settings.POWERDNS_USER,
        database: Meteor.settings.POWERDNS_DB,
        password: Meteor.settings.POWERDNS_PASSWORD});

  rawConnection.connect(function(err) {
    if (err) {
      throw new Error(err);
    }
  });

  wrappedQuery = Meteor.wrapAsync(rawConnection.query, rawConnection);
  return wrappedQuery;
};

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

    var result = wrappedQuery(
      "DELETE from `records` WHERE (domain_id = (SELECT `id` from `domains` WHERE `name` = ?)) AND " +
        "name = ?",
      [domain, host]);
    console.log("Successfully deleted record(s) for " + host + "." + "with status " + JSON.stringify(result) + ".");
  }
};

createRecord = function(mysqlQuery, domain, host, type, content) {
  // Do the insert, allowing Meteor to turn this into an exception if
  // it returns an error.
  mysqlQuery(
    "INSERT INTO records (domain_id, name, type, content) VALUES ((SELECT id FROM domains WHERE domains.name = ?), ?, ?, ?);",
    [domain, host, type, content]);

  console.log("Successfully added " + host + " = " + content + " (" + type + ").");
};

createDomainIfNeeded = function(mysqlQuery) {
  var rows = mysqlQuery(
    "SELECT name FROM `domains` WHERE name = ?",
    [Meteor.settings.BASE_DOMAIN]);

  if (rows.length === 0) {
    console.log("Creating " + Meteor.settings.BASE_DOMAIN + "...");
    createDomain(mysqlQuery, Meteor.settings.BASE_DOMAIN);
  }
}

function createDomain(mysqlQuery, domain) {
  var result = mysqlQuery(
    "INSERT INTO `domains` (name, type) VALUES (?, 'NATIVE');",
    [domain]);

  console.log("Created domain; it received ID #" + result.insertId);
  console.log("Creating records for top level...");
  createRecord(mysqlQuery, Meteor.settings.BASE_DOMAIN, Meteor.settings.BASE_DOMAIN, 'A', '127.0.0.1');
  createRecord(mysqlQuery, Meteor.settings.BASE_DOMAIN, Meteor.settings.BASE_DOMAIN, 'SOA', formatSoaRecord(
    // The SOA advertises the first nameserver.
    Meteor.settings.NS1_HOSTNAME,
    // It advertises hostmaster@Meteor.settings.BASE_DOMAIN as a contact email address.
    'hostmaster.' + Meteor.settings.BASE_DOMAIN,
    // For the rest of these, see formatSoaRecord()'s variable names.
    1,
    60,
    60,
    604800,
    60));
  createRecord(mysqlQuery, Meteor.settings.BASE_DOMAIN, Meteor.settings.BASE_DOMAIN, 'NS', Meteor.settings.NS1_HOSTNAME);
  createRecord(mysqlQuery, Meteor.settings.BASE_DOMAIN, Meteor.settings.BASE_DOMAIN, 'NS', Meteor.settings.NS2_HOSTNAME);
}

publishOneUserRegistrationToDns = function(mysqlQuery, hostname, ipAddress) {
  // Given a hostname, and an IP address, we set up wildcard
  // records accordingly in the PowerDNS database.
  //
  // Note that PowerDNS will cache DNS queries for ~20 seconds
  // (configurable) before it actually queries the SQL database to
  // find out what the new value is. This is on top of any TTL in
  // the DNS record itself, as I understand it.
  deleteRecordIfExists(mysqlQuery, Meteor.settings.BASE_DOMAIN, hostname);

  createRecord(mysqlQuery, Meteor.settings.BASE_DOMAIN, hostname + '.' + Meteor.settings.BASE_DOMAIN, 'A', ipAddress);
  createRecord(mysqlQuery, Meteor.settings.BASE_DOMAIN, '*.' + hostname + '.' + Meteor.settings.BASE_DOMAIN, 'A', ipAddress);
}

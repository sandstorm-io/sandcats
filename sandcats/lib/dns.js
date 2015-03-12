// Pure-function helpers.
function formatSoaRecord(primaryNameServer, adminEmailUsingDots, serialNumber,
                         secondsBeforeRefresh,
                         secondsBeforeRefreshRetry, secondsBeforeDiscardStaleCache,
                         negativeResultTtl) {
  return [primaryNameServer, adminEmailUsingDots, serialNumber, secondsBeforeRefresh,
          secondsBeforeRefreshRetry, secondsBeforeDiscardStaleCache,
          negativeResultTtl].join(" ");
};

// Public functions for use by other JS files.

// Functions that communicate with the MySQL PowerDNS database.
createWrappedQuery = function() {
  var mysql = Meteor.npmRequire('mysql');
  var connectionPool =
      mysql.createPool({
        connectionLimit: 5,
        host: 'localhost',
        user: Meteor.settings.POWERDNS_USER,
        database: Meteor.settings.POWERDNS_DB,
        password: Meteor.settings.POWERDNS_PASSWORD});

  wrappedQuery = Meteor.wrapAsync(connectionPool.query, connectionPool);
  return wrappedQuery;
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

publishOneUserRegistrationToDns = function(mysqlQuery, hostname, ipAddress) {
  // Given a hostname, and an IP address, we set up wildcard
  // records accordingly in the PowerDNS database.
  //
  // Note that PowerDNS will cache DNS queries for ~20 seconds
  // (configurable) before it actually queries the SQL database to
  // find out what the new value is. This is on top of any TTL in
  // the DNS record itself, as I understand it.
  deleteRecordIfExists(mysqlQuery, Meteor.settings.BASE_DOMAIN, hostname);

  // Create the DNS records in the table. We would do well to bump the
  // SOA, too.
  rawCreateRecord(mysqlQuery, Meteor.settings.BASE_DOMAIN, hostname + '.' + Meteor.settings.BASE_DOMAIN, 'A', ipAddress);
  rawCreateRecord(mysqlQuery, Meteor.settings.BASE_DOMAIN, '*.' + hostname + '.' + Meteor.settings.BASE_DOMAIN, 'A', ipAddress);
  bumpSoaRecord(mysqlQuery, Meteor.settings.BASE_DOMAIN);
}

// Private functions.

// This function adds a DNS record to PowerDNS's MySQL data store.
//
// Note that this thing is pretty naive. If you provide an
// unreasonable text value, it isn't smart enough to tell you to fix
// it. It won't help you (directly) with the SOA record, either.
var rawCreateRecord = function(mysqlQuery, domain, host, type, content) {
  // Do the insert, allowing Meteor to turn this into an exception if
  // it returns an error.
  mysqlQuery(
    "INSERT INTO records (domain_id, name, type, content) VALUES ((SELECT id FROM domains WHERE domains.name = ?), ?, ?, ?);",
    [domain, host, type, content]);

  console.log("Successfully added " + host + " = " + content + " (" + type + ").");
};

function createDomain(mysqlQuery, domain) {
  var result = mysqlQuery(
    "INSERT INTO `domains` (name, type) VALUES (?, 'NATIVE');",
    [domain]);

  console.log("Created domain; it received ID #" + result.insertId);
  console.log("Creating records for top level...");
  rawCreateRecord(mysqlQuery, Meteor.settings.BASE_DOMAIN, Meteor.settings.BASE_DOMAIN, 'A', Meteor.settings.NS1_IP_ADDRESS);
  rawCreateRecord(mysqlQuery, Meteor.settings.BASE_DOMAIN, Meteor.settings.BASE_DOMAIN, 'SOA', formatSoaRecord(
    // The SOA advertises the first nameserver.
    Meteor.settings.NS1_HOSTNAME,
    // It advertises hostmaster@Meteor.settings.BASE_DOMAIN as a contact email address.
    'hostmaster.' + Meteor.settings.BASE_DOMAIN,
    // For the rest of these, see formatSoaRecord()'s variable names.
    1,
    1,
    60,
    60,
    604800,
    60));
  rawCreateRecord(mysqlQuery, Meteor.settings.BASE_DOMAIN, Meteor.settings.BASE_DOMAIN, 'NS', Meteor.settings.NS1_HOSTNAME);
  rawCreateRecord(mysqlQuery, Meteor.settings.BASE_DOMAIN, Meteor.settings.BASE_DOMAIN, 'NS', Meteor.settings.NS2_HOSTNAME);
}

function bumpSoaRecord(mysqlQuery, domain) {
  var currentSoaResult = wrappedQuery(
    "SELECT id, content from `records` WHERE " +
      "(domain_id = (SELECT `id` from `domains` WHERE `name` = ?)) AND " +
      "type='SOA' AND " +
      "name = ?",
    [domain, domain]);
  var currentSoa = currentSoaResult[0];

  // We assume it splits up nicely into the data that
  // formatSoaRecord() needs.
  var splitted = currentSoa.content.split(' ');
  var soaData = {
    primaryNameServer: splitted[0],
    adminEmailUsingDots: splitted[1],
    serialNumber: splitted[2],
    secondsBeforeRefresh: splitted[3],
    secondsBeforeRefreshRetry: splitted[4],
    secondsBeforeDiscardStaleCache: splitted[5],
    negativeResultTtl: splitted[6]
  };

  soaData.serialNumber = Number(soaData.serialNumber) + 1;
  var newSoaData = formatSoaRecord(
    soaData.primaryNameServer,
    soaData.adminEmailUsingDots,
    soaData.serialNumber,
    soaData.secondsBeforeRefresh,
    soaData.secondsBeforeRefreshRetry,
    soaData.secondsBeforeDiscardStaleCache,
    soaData.negativeResultTtl);

  // Do an UPDATE and make sure it updated 1 row.
  var queryResult = wrappedQuery(
    "UPDATE `records` " +
      "SET content=? WHERE " +
      "id=? ",
    [newSoaData, currentSoa.id]);
  if (queryResult.changedRows != 1) {
    throw new Error("SOA updating failed, leaving us totally confused.");
  }
  console.log("Updated SOA to " + newSoaData);
}

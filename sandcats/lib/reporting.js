// General strategy of GlobalSign reporting:
//
// - There's a function to generate a report.
//
// - We call it daily and store its content in
//   $HOME/globalsign-reports/$(date -I).txt
//
// - After creating that file, we email it to
//  Meteor.settings.DAILY_REPORT_RECIPIENTS.
//
// - If it's a Monday, we *also* email it to
//   Meteor.settings.WEEKLY_REPORT_RECIPIENTS.

Reporting = {}


/*
   Might as well show orders that never made it from status:in-progress to status:completed, while we're printing stuff.

   Proposed plan:

   Once a day, send a usage log to an internal Sandstorm list, so we can make sure that it is generally working OK. (Maybe disable this after a while.)

   On Mondays, that usage log also gets sent to GlobalSign (probably by having the software send to a different Google Group on Mondays, where GlobalSign people have been added to that group).

   The Monday email would contain # of certificate-weeks that we've used total against the production API.

   The every-day email would contain # of certificate-weeks used total, as well as the # issued in the past 7 days, for both GlobalSign's production & dev APIs.
*/
var baseDir = null;

function pushHostnamesSinceTimestamp(timestamp, reportLines) {
  var hostnames = [];
  line += CertificateRequests.find({
    devOrProd: options[i], globalsignCertificateInfo: {$exists: true},
    requestCreationDate: {$gt: timestamp}
  }, {
    fields: {'hostname': 1}}).forEach(function(doc) {
      hostnames.push(doc.hostname);
    });

  var uniqueHostnames = hostnames.sort().filter(function(item, position, dataset) {
    // Since it's sorted, we can throw away anything that is the
    // same as the thing before it.
    if (dataset[position-1] == item) {
      return false;
    }
    return true;
  });

  uniqueHostnames.map(function(s) {
    reportLines.push("* " + s);
  });
}


Reporting.generateReport = function() {
  var sevenDaysInMilliseconds = 1000 * 60 * 60 * 24 * 7;
  var sevenDaysAgo = new Date().getTime() - sevenDaysInMilliseconds;
  var fourteenDaysAgo = sevenDaysAgo - sevenDaysInMilliseconds;

  var reportLines = [];
  reportLines.push("HTTPS certificate usage report for " + Meteor.settings.GLOBALSIGN_DOMAIN);
  reportLines.push('');
  reportLines.push("Report generated on " + new Date());
  reportLines.push('');

  var options = ['dev', 'prod'];
  for (var i = 0; i < options.length; i++) {
    var line = "Total certificate-weeks issued so far against " + options[i] + ": ";
    // We store the intended use period in the database, but it's
    // always 7 days, so we don't have to bother querying it.
    line += CertificateRequests.find({
      devOrProd: options[i], globalsignCertificateInfo: {$exists: true}
    }).count();
    reportLines.push(line);
  }

  reportLines.push("");
  reportLines.push("------------ details for the curious ------------");
  reportLines.push("");

  for (var i = 0; i < options.length; i++) {
    var line = "In the last 7 days, against " + options[i] + ", we issued: ";
    line += CertificateRequests.find({
      devOrProd: options[i], globalsignCertificateInfo: {$exists: true},
      requestCreationDate: {$gt: sevenDaysAgo}
    }).count();
    reportLines.push(line);
  }

  reportLines.push("");

  for (var i = 0; i < options.length; i++) {
    reportLines.push("Hostnames from the last 7 days against " + options[i] + "):");
    pushHostnamesSinceTimestamp(sevenDaysAgo, reportLines);
    console.log('');

    reportLines.push("Hostnames from the last 14 days against " + options[i] + "):");
    pushHostnamesSinceTimestamp(fourteenDaysAgo, reportLines);
    console.log('');
  }
}

Meteor.startup(function() {
  // HACK for now; the console is not the place for this.
  Meteors.setInterval(function() {
    console.log(Reporting.generateReport());
  }, 10 * 1000);
};

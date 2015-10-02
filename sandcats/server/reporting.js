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

var Fs = Npm.require("fs");

function mkdirOkIfExists(dir) {
  try {
    Fs.mkdirSync(dir, "0700");
  } catch (e) {
    if (e.code == 'EEXIST') {
      return;
    }
    throw e;
  }
};

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

function pushHostnamesSinceTimestamp(start, end, devOrProd, reportLines) {
  var query = CertificateRequests.find({
    devOrProd: devOrProd, globalsignCertificateInfo: {$exists: true},
    receivedCertificateDate: {$gte: start, $lte: end}
  }, {
    fields: {'hostname': 1}});
  return pushHostnamesFromQueryAsBulletedList(query, reportLines);
}

function pushHostnamesFromQueryAsBulletedList(query, reportLines) {
  var hostnames = [];
  query.forEach(function(doc) {
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


Reporting.generateReport = function(startTimestamp, endTimestamp) {
  var startDate = new Date(startTimestamp);
  var endDate = new Date(endTimestamp);
  var now = new Date();

  var reportLines = [];
  reportLines.push("HTTPS certificate usage report for " + Meteor.settings.GLOBALSIGN_DOMAIN);
  reportLines.push('');
  reportLines.push("Report generated on " + now);
  reportLines.push("       covering time from " + startDate);
  reportLines.push("                     to   " + endDate);
  reportLines.push('');

  var options = ['dev', 'prod'];
  for (var i = 0; i < options.length; i++) {
    var line = "Total certificate-weeks issued so far against " + options[i] + ": ";
    // We store the intended use period in the database, but it's
    // always 7 days, so we don't have to bother querying it.
    line += CertificateRequests.find({
      devOrProd: options[i], globalsignCertificateInfo: {$exists: true},
      receivedCertificateDate: {$lte: endDate}
    }).count();
    reportLines.push(line);
  }

  reportLines.push("");
  reportLines.push("------------ details for the curious ------------");
  reportLines.push("");

  for (var i = 0; i < options.length; i++) {
    var line = "In the time period " + options[i] + ", we issued: ";
    line += CertificateRequests.find({
      devOrProd: options[i], globalsignCertificateInfo: {$exists: true},
      receivedCertificateDate: {$gte: startDate, $lte: endDate}
    }).count();
    reportLines.push(line);
  }

  reportLines.push("");

  for (var i = 0; i < options.length; i++) {
    reportLines.push("Hostnames from the time period (" + options[i] + "):");
    pushHostnamesSinceTimestamp(startDate, endDate, options[i], reportLines);
    reportLines.push('');
  }

  reportLines.push("");
  for (var i = 0; i < options.length; i++) {
    reportLines.push("Hostnames requested in the period with no GlobalSign response (" + options[i] + "):");
    var query = CertificateRequests.find({
      devOrProd: options[i], globalsignCertificateInfo: {$exists: false},
      requestCreationDate: {$gte: startDate, $lte: endDate}
  }, {
    fields: {'hostname': 1}});
    pushHostnamesFromQueryAsBulletedList(query, reportLines);
  }

  return reportLines.join("\n");
}

Reporting.generateAllNeededReports = function(unsentBasePath) {
  // This gets function gets called every hour.
  var startDate = new Date("Tue, 01 Sep 2015 00:00:00 GMT").getTime();

  var now = new Date().getTime();
  var oneDayInMilliseconds = 1000 * 60 * 60 * 24;
  var oneWeekInMilliseconds = oneDayInMilliseconds * 7;

  // Calculate the first report date to generate. Note that the
  // reports are backward-looking 7 days, so might as well add 1 week
  // to the startDate.
  var possibleReportToGenerate = startDate + oneWeekInMilliseconds;
  console.log("now", new Date(now));
  console.log("possibleReportToGenerate", new Date(possibleReportToGenerate));
  while (possibleReportToGenerate < now) {
    // Check if this report exists. If so, then keep looping
    var formattedReportDate = new Date(possibleReportToGenerate).toISOString().split(
      "T")[0];
    var reportFilename = unsentBasePath + "/" + formattedReportDate;
    if (Fs.existsSync(reportFilename)) {
      possibleReportToGenerate += oneDayInMilliseconds;
      continue;
    }

    // OK! So we need to generate a report from the timestamp possibleReportToGenerate
    // up to one week before it.
    console.log("Generating GlobalSign report for", new Date(), "into filename", reportFilename);
    var timePeriodEnd = possibleReportToGenerate;
    var previousWeekStart = (timePeriodEnd - oneWeekInMilliseconds + 1);
    // Define previousWeekStart as millisecond #1 in the week, since
    // we'll use $lte and $gte in queries.

    var reportText = Reporting.generateReport(previousWeekStart, timePeriodEnd);

    Fs.writeFileSync(reportFilename, reportText);
    possibleReportToGenerate += oneDayInMilliseconds;
    // Keep looping.
  }
};


Meteor.startup(function() {
  // Strategy for repeated tasks where we don't care when it runs, but
  // we do care that it always runs with the same offset.
  //
  // * Use a file to store the previous run, and the file is named
  //   after the timestamp against-which we calculated the query.
  //
  // * Store a report once per day.
  //
  // * Run the generateReports function at startup and again every
  //   hour, and generate any back-reports, since the server might
  //   have been offline.
  //
  // * Don't generate any reports before Sep 1 2015, since nothing
  //   interesting happened before that date. (In terms of the
  //   GlobalSign API, at least.)
  //
  // * TODO(soon): When we successfuly send the report to email
  //   recipients, move it into a slightly different path to indicate
  //   that.
  var basePath = process.env.HOME + "/globalsign-reports";
  mkdirOkIfExists(basePath);

  var unsentBasePath = basePath + "/unsent";
  mkdirOkIfExists(unsentBasePath);

  function doAndQueueReportGeneration() {
    // Do...
    Reporting.generateAllNeededReports(unsentBasePath);
    /// and queue.
    var oneHourinMilliseconds = 1000 * 60 * 60;
    Meteor.setTimeout(doAndQueueReportGeneration, oneHourinMilliseconds);
  }

  doAndQueueReportGeneration();
});

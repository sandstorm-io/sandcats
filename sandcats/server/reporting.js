// General strategy of GlobalSign reporting:
//
// - There's a function to generate a report.
//
// - Daily we save a report to ~/globalsign-reports/unsent/$(date -I)
//
// - We send an email to the right recipients and rename the file into
//   .../sent/$(date -I).

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

function pushHostnamesSinceTimestamp(start, end, devOrProd, reportLines) {
  var query = CertificateRequests.find({
    devOrProd: devOrProd, globalsignCertificateInfo: {$exists: true},
    receivedCertificateDate: {$gte: start, $lte: end}
  }, {
    fields: {'hostname': 1}});
  return pushHostnamesFromQueryAsBulletedList(query, reportLines);
}

function sendAnyUnsentReports(unsentBasePath, sentBasePath) {
  // Look in unsent/ and for every report there, send it to
  // Meteor.settings.DAILY_REPORT_RECIPIENTS and then move it to
  // sent/.
  //
  // Note that if if the report is for a Monday, also add
  // Meteor.settings.WEEKLY_REPORT_RECIPIENTS to the email recipients.

  var files = Fs.readdirSync(unsentBasePath);
  for (var i = 0; i < files.length; i++) {
    var filename = files[i];
    var filenameAbsolute = unsentBasePath + '/' + filename;
    var filenameAfterRename = sentBasePath + '/' + filename;
    var reportDate = new Date(filename + "T00:00:00Z");
    var recipients = Meteor.settings.DAILY_REPORT_RECIPIENTS;
    if (reportDate.toUTCString().indexOf('Mon, ') == 0) {
      Meteor.settings.WEEKLY_REPORT_RECIPIENTS.forEach(function(address) {
        recipients.push(address);
      });
    }
    if (recipients.length == 0) {
      throw new Error("Somehow there are 0 recipients. Should not happen.");
    }

    var body = Fs.readFileSync(filenameAbsolute, 'utf-8');
    var subject = body.split('\n')[0].trim();

    var emailData = {
      to: recipients,
      subject: subject,
      text: body
    };
    if (Meteor.settings.DAILY_REPORT_DONT_ACTUALLY_SEND) {
      console.log(emailData);
    } else {
      Email.send(emailData);
    }

    Fs.renameSync(filenameAbsolute, filenameAfterRename);
  }
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
  reportLines.push("                       to " + endDate);
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

Reporting.generateAllNeededReports = function(unsentBasePath, sentBasePath) {
  // This gets function gets called every hour.
  var startDate = new Date("Tue, 01 Sep 2015 00:00:00 GMT").getTime();

  var now = new Date().getTime();
  var oneDayInMilliseconds = 1000 * 60 * 60 * 24;
  var oneWeekInMilliseconds = oneDayInMilliseconds * 7;

  // Calculate the first report date to generate. Note that the
  // reports are backward-looking 7 days, so might as well add 1 week
  // to the startDate.
  var possibleReportToGenerate = startDate + oneWeekInMilliseconds;
  while (possibleReportToGenerate < now) {
    // Check if this report exists. If so, then keep looping
    var formattedReportDate = new Date(possibleReportToGenerate).toISOString().split(
      "T")[0];
    var reportFilename = unsentBasePath + "/" + formattedReportDate;
    var sentReportFilename = sentBasePath + "/" + formattedReportDate;
    if (Fs.existsSync(reportFilename) ||
        Fs.existsSync(sentReportFilename)) {
      possibleReportToGenerate += oneDayInMilliseconds;
      continue;
    }

    // OK! So we need to generate a report from the timestamp
    // possibleReportToGenerate up to one week before it.
    console.log("Generating GlobalSign report for", new Date(possibleReportToGenerate),
                "into filename", reportFilename);
    var timePeriodEnd = possibleReportToGenerate;
    var previousWeekStart = (timePeriodEnd - oneWeekInMilliseconds + 1);
    // Define previousWeekStart as millisecond #1 in the week, since
    // we'll use $lte and $gte in queries.

    var reportText = Reporting.generateReport(previousWeekStart, timePeriodEnd);

    Fs.writeFileSync(reportFilename, reportText);
    possibleReportToGenerate += oneDayInMilliseconds;
    // Keep looping.
  }

  // Trigger a check to see if any of the newly-generated reports need
  // to be sent by email.
  sendAnyUnsentReports(unsentBasePath, sentBasePath);
};

Meteor.startup(function() { Meteor.setTimeout(function () {
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
  function doAndQueueReportGeneration(unsentBasePath, sentBasePath) {
    // Do...
    Reporting.generateAllNeededReports(unsentBasePath, sentBasePath);
    /// and queue.
    var oneHourinMilliseconds = 1000 * 60 * 60;
    Meteor.setTimeout(function() {
      doAndQueueReportGeneration(unsentBasePath, sentBasePath);
    }, oneHourinMilliseconds);
  }

  if ((Meteor.settings.DAILY_REPORT_RECIPIENTS.length > 0) ||
      (Meteor.settings.WEEKLY_REPORT_RECIPIENTS.length > 0)) {
    var basePath = process.env.HOME + "/globalsign-reports";
    mkdirOkIfExists(basePath);

    var unsentBasePath = basePath + "/unsent";
    mkdirOkIfExists(unsentBasePath);

    var sentBasePath = basePath + "/sent";
    mkdirOkIfExists(sentBasePath);

    doAndQueueReportGeneration(unsentBasePath, sentBasePath);
  } else {
    console.log("Not attempting to generate reports because no one will read them.");
  }
}, 10 * 1000)});

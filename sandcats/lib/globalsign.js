var soap = Meteor.npmRequire('soap');
var globalsignWsdls = {
  'dev': 'https://testsystem.globalsign.com/kb/ws/v1/ManagedSSLService?wsdl',
  'prod': null  // for now.
};

// We use _clients to cache working SOAP client to the various
// GlobalSign API endpoints we need.
//
// Do not access it directly. Access it via getClient() so it can be
// created if needed.
var _clients = {};
getDevOrProdByHostname = function(hostname) {
  if (_.contains(Meteor.settings.GLOBALSIGN_DEV_HOSTNAMES, hostname)) {
    return 'dev';
  }
  if (_.contains(Meteor.settings.GLOBALSIGN_PROD_HOSTNAMES, hostname)) {
    return 'prod';
  }
  return Meteor.settings.GLOBALSIGN_DEFAULT;
}

function getUsername(devOrProd) {
  if (! devOrProd) {
    throw new Error("getUsername needs to know if you want dev or prod.");
  }
  var usernameKey = {'dev': 'GLOBALSIGN_DEV_USERNAME',
                     'prod': 'GLOBALSIGN_PROD_USERNAME'}[devOrProd];
  return Meteor.settings[usernameKey] || process.env[usernameKey];
}

function getPassword(devOrProd) {
  var passwordKey = {'dev': 'GLOBALSIGN_DEV_PASSWORD',
                     'prod': 'GLOBALSIGN_PROD_PASSWORD'}[devOrProd];
  return process.env[passwordKey];
}

function getClient(devOrProd) {
  if (! Meteor.settings.GLOBALSIGN_DOMAIN) {
    throw new Error("Cannot construct client since we have no domain configured.");
  }

  if (! getUsername(devOrProd)) {
    throw new Error("Cannot construct client since we have no username configured.");
  }

  if (! getPassword(devOrProd)) {
    throw new Error("Cannot construct client since we have no password available.");
  }

  if (! _clients[devOrProd]) {
    _clients[devOrProd] = Meteor.wrapAsync(soap.createClient)(globalsignWsdls[devOrProd]);
  }
  return _clients[devOrProd];
}

// For custom certificate validity, GlobalSign's API wants us to
// provide a months value that is >= 6. So we use this one.
var DUMMY_MONTHS_VALUE = 6;

// Use this function to get information about a domain.
getMsslDomainInfo = function(domain, devOrProd) {
  var wrapped = Meteor.wrapAsync(getClient(devOrProd).GetMSSLDomains);
  var args = {
    'Request': {
      'QueryRequestHeader': {
        'AuthToken': {
          'UserName': getUsername(devOrProd),
          'Password': getPassword(devOrProd)
        }}}};
  var result = wrapped(args);
  var usefulResult = {};
  for (var i = 0; i < result.Response.SearchMsslDomainDetails.SearchMsslDomainDetail.length; i++) {
    var detail = result.Response.SearchMsslDomainDetails.SearchMsslDomainDetail[i];
    if (detail.MSSLDomainName == domain) {
      usefulResult['MSSLDomainID'] = detail.MSSLDomainID;
      usefulResult['MSSLProfileID'] = detail.MSSLProfileID;
      break;
    }
  }

  return usefulResult;
}

// Like _clients, _myDomainInfo caches information to avoid
// unnecessary fetching. Also like _clients this variable contains
// data from the GlobalSign prod API as well as from the GlobalSign
// dev API. Don't access _myDomainInfo directly; access it via
// getMyDomainInfo().
var _myDomainInfo = {};
getMyDomainInfo = function(devOrProd) {
  if (! _myDomainInfo[devOrProd]) {
    _myDomainInfo[devOrProd] = getMsslDomainInfo(Meteor.settings.GLOBALSIGN_DOMAIN, devOrProd);
  }
  return _myDomainInfo[devOrProd];
}

// This function generates the list of arguments we provide to PVOrder
// by GlobalSign.

// This function returns an object containing just the
// OrderRequestParameter data we need to pass to the GlobalSign
// API. Its input is the text of a certificate signing request (CSR).
//
// It assumes any authorization validation has already been done on
// the CSR data. If not, treat its output with caution.
getOrderRequestParameter = function(csrText, now) {
  // We take now as an optional parameter, so we can unit-test how the
  // function operates in the case of various times.
  if (! now) {
    now = new Date();
  }
  now = new Date(now.getTime() + (1000 * 1000));

  // The end date is set to 9 days in the future. This is due to a
  // limitation of the GlobalSign API. Particularly:
  //
  // - If we provide a NotBefore value, it has to be about an hour in
  //   the future, and
  //
  // - If we omit NotBefore, then NotAfter has to be about 9 days in
  //   the future.
  //
  // We treat these as 7-day certificates for the purpose of planning
  // renewals and generating reports.
  var end = new Date(now.getTime() + (9*86400000));
  var args = {
    'OrderRequestParameter': {
      'ProductCode': 'PV',
      'OrderKind': 'new',
      'ValidityPeriod': {
        'Months': DUMMY_MONTHS_VALUE,
        'NotBefore': null,
        'NotAfter': end.toISOString()
      },
      'Options': [
        {'Option': {
          'OptionName': 'VPC',
          'OptionValue': 'true'
        }}],
      'BaseOptions': [
        {'Option': {
          'OptionName': 'wildcard',
          'OptionValue': 'true'
        }}],
      'CSR': csrText
    }
  };
  console.log("Created GlobalSign API parameters:", JSON.stringify(args));
  return args;
}

// This function calculates the full argument set required for
// PVOrder, including the AuthToken in the
// OrderRequestHeader. Therefore it does require secrets and can't
// be as easily unit-tested.
getAllSignCsrArgs = function(domainInfo, csrText, devOrProd) {
  var args = {
    'MSSLDomainID': domainInfo.MSSLDomainID,
    'MSSLProfileID': domainInfo.MSSLProfileID,
    'OrderRequestHeader': {
      'AuthToken': {
        'UserName': getUsername(devOrProd),
        'Password': getPassword(devOrProd)
      }
    },
    // Note: ContactInfo is ignored by GlobalSign in the ManagedSSL
    // product, and ManagedSSL is the product of theirs that we use.
    'ContactInfo': {
      'FirstName': 'Sandstorm',
      'LastName': 'Development Group',
      'Phone': '+1 585-506-8865',
      'Email': 'certmaster@sandstorm.io'}
  };
  args = _.extend(args, getOrderRequestParameter(csrText));
  var finalArgs = {'Request': args};
  return finalArgs;
};

issueCertificate = function(csrText, devOrProd) {
  var domainInfo = getMyDomainInfo(devOrProd);
  var args = getAllSignCsrArgs(domainInfo, csrText, devOrProd);
  var wrapped = Meteor.wrapAsync(getClient(devOrProd).PVOrder);
  var globalsignResponse = wrapped(args);
  if (globalsignResponse.Response.OrderResponseHeader.SuccessCode == -1) {
    console.log("Received error from GlobalSign:", JSON.stringify(globalsignResponse.Response.OrderResponseHeader.Errors));
  }
  return globalsignResponse;
};

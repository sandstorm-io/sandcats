function finishResponse(status, jsonData, response) {
  response.writeHead(status, {'Content-Type': 'text/json'});
  response.end(JSON.stringify(jsonData));
}

function antiCsrf(request, response) {
  // Two mini anti-cross-site request forgery checks: POST and a
  // custom HTTP header.
  var requestEnded = false;
  if (request.method != 'POST') {
    finishResponse(400, {'error': 'Must POST.'}, response);
    requestEnded = true;
  }
  if (request.headers['x-sand'] != 'cats') {
    finishResponse(403, {'error': 'Must have x-sand: cats header.'}, response);
    requestEnded = true;
  }
}

doRegister = function(request, response) {
  console.log("PARTY TIME");

  var requestEnded = antiCsrf(request, response);
  if (requestEnded) {
    return;
  }

  // Before validating the form, we add an IP address field to it.
  //
  // The X-Forwarded-For header contains IP addresses in a
  // comma-separated list, with the final one being the one that was
  // most recently validated. For our purposes, let's use that.
  var xffHeaderValues = (request.headers['x-forwarded-for'] || "").split(",");
  var clientIp = xffHeaderValues[xffHeaderValues.length - 1];

  var clientCertificateFingerprint = request.headers['x-client-certificate-fingerprint'] || "";


  // The form data is the request body, plus some extra data that we
  // add as if the user submitted it, for convenience of our own
  // processing.
  var rawFormData = _.clone(request.body);
  rawFormData.ipAddress = clientIp;

  // For easy consistency, and to avoid wasting space, turn
  // e.g. "ab:cd" into "abcd".
  rawFormData.pubkey = clientCertificateFingerprint.replace(/:/g, "");

  var validatedFormData = Mesosphere.registerForm.validate(rawFormData);
  if (validatedFormData.errors) {
    return finishResponse(400, {'error': validatedFormData.errors}, response);
  }

  // Great! It passed all our validation, including the
  // Sandcats-specific validation. In that case, let's store an item
  // in our Mongo collection and also update DNS.
  createUserRegistration(validatedFormData.formData);

  // Give the user an indication of our success.
  return finishResponse(200, {'success': true}, response);
}

function createUserRegistration(formData) {
  // To create a user registration, we mostly copy data from the form.
  // We do also need to store a public key "fingerprint", which for
  // now we calculated as deadbeaf.

  // FIXME: Attach this to the form data via a validator, as an
  // aggregate, to avoid double-computing it.
  var userRegistrationId = UserRegistrations.insert({
    hostname: formData.rawHostname,
    ipAddress: formData.ipAddress,
    publicKeyId: formData.pubkey,
    emailAddress: formData.email
  });

  var userRegistration = UserRegistrations.findOne({_id: userRegistrationId});

  // We also probably want to send a confirmation URL. FIXME.
  // Arguably we should do this with Meteor accounts. Hmm.

  // Now, publish the UserRegistration to DNS.
  console.log("Created UserRegistration with these details: %s",
              JSON.stringify(userRegistration));
  publishOneUserRegistrationToDns(
    mysqlQuery,
    userRegistration.hostname,
    userRegistration.ipAddress);
}

doUpdate = function(request, response) {
  Meteor._debug("ZZZ");
  console.log("PARTY TIME");

  var requestEnded = antiCsrf(request, response);
  if (requestEnded) {
    return;
  }

  // Before validating the form, we add an IP address field to it.
  var clientIp = request.headers['x-forwarded-for'];

  // The form data is the request body, plus some extra data that we
  // add as if the user submitted it, for convenience of our own
  // processing.
  var rawFormData = _.clone(request.body);
  rawFormData.ipAddress = clientIp;
  console.log(request.connection.httpHeaders);
  console.log(request.connection.headers);
  console.log("PARTY TIME");

  var clientCertificateFingerprint = request.headers['x-client-certificate-fingerprint'] || "";

  // For easy consistency, and to avoid wasting space, turn
  // e.g. "ab:cd" into "abcd".
  rawFormData.pubkey = clientCertificateFingerprint.replace(/:/g, "");

  var validatedFormData = Mesosphere.updateForm.validate(rawFormData);
  if (validatedFormData.errors) {
    return finishResponse(400, {'error': validatedFormData.errors}, response);
  }

  if (validatedFormData.formData.updateIsAuthorized) {
    return finishResponse(200, {'ok': 'lookin good'}, response);
  } else {
    return finishResponse(403, {'error': 'not authorized'}, response);
  }
};

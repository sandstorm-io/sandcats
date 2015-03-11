function finishResponse(status, jsonData, response) {
  response.writeHead(status, {'Content-Type': 'text/json'});
  response.end(JSON.stringify(jsonData));
}

function responseFromFormFailure(validatedFormData) {
  var response = {error: validatedFormData.errors};

  // This is a convenience for helping me, in the future, display
  // error messages as I integrate Sandcats support into the Sandstorm
  // installer.
  if (validatedFormData.errors &&
      validatedFormData.errors.pubkey &&
      validatedFormData.errors.pubkey.required) {
    response['text'] = (
      'Your client is misconfigured. You need to provide a client certificate.');
  }

  return response;
}


function antiCsrf(request, response) {
  // Two mini anti-cross-site request forgery checks: POST and a
  // custom HTTP header.
  var requestEnded = false;
  if (request.method != 'POST') {
    finishResponse(403, {'text': 'Must POST.'}, response);
    requestEnded = true;
  }
  if (request.headers['x-sand'] != 'cats') {
    finishResponse(403, {'text': 'Your client is misconfigured. You need X-Sand: cats'}, response);
    requestEnded = true;
  }
  return requestEnded;
}

function getFormDataFromRequest(request) {
  // The form data is the request body, plus some extra data that we
  // add as if the user submitted it, for convenience of our own
  // processing.
  var rawFormData = _.clone(request.body);

  var clientIp = getClientIpFromRequest(request);
  rawFormData.ipAddress = clientIp;

  // For easy consistency, and to avoid wasting space, turn
  // e.g. "ab:cd" into "abcd".
  var clientCertificateFingerprint = request.headers['x-client-certificate-fingerprint'] || "";
  rawFormData.pubkey = clientCertificateFingerprint.replace(/:/g, "");

  return rawFormData;
}

function getClientIpFromRequest(request) {
  // The X-Real-IP header contains the client's IP address, and since
  // it's a non-standard header, the Meteor built-in proxy does not
  // mess with it. We assume nginx is going to give this to us.
  var clientIp = request.headers['x-real-ip'] || "";
  return clientIp || "";
}

doRegister = function(request, response) {
  console.log("PARTY TIME");

  var requestEnded = antiCsrf(request, response);
  if (requestEnded) {
    return;
  }

  var rawFormData = getFormDataFromRequest(request);

  var validatedFormData = Mesosphere.registerForm.validate(rawFormData);
  if (validatedFormData.errors) {
    return finishResponse(400,
                          responseFromFormFailure(validatedFormData),
                          response);
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

function updateUserRegistration(formData) {
  // To update a user registration, we mostly copy data from the form.
  //
  // We use the form's key fingerprint as the primary key to
  // do the lookup, and then update whatever hostname is
  // registered to the key fingerprint.
  //
  // Finally, we publish this to DNS.
  UserRegistrations.update({
    publicKeyId: formData.pubkey
  }, {$set: {ipAddress: formData.ipAddress}});

  var userRegistration = UserRegistrations.findOne({publicKeyId: formData.pubkey});

  console.log("Update UserRegistration with these details: %s",
              JSON.stringify(userRegistration));

  publishOneUserRegistrationToDns(
    mysqlQuery,
    userRegistration.hostname,
    userRegistration.ipAddress);
}

doUpdate = function(request, response) {
  var requestEnded = antiCsrf(request, response);
  if (requestEnded) {
    return;
  }

  var rawFormData = getFormDataFromRequest(request);

  var validatedFormData = Mesosphere.updateForm.validate(rawFormData);
  if (validatedFormData.errors) {
    return finishResponse(400,
                          responseFromFormFailure(validatedFormData),
                          response);
  }

  if (validatedFormData.formData.updateIsAuthorized) {
    updateUserRegistration(validatedFormData.formData);
    return finishResponse(200, {'ok': 'lookin good'}, response);
  } else {
    return finishResponse(403, {'error': 'not authorized'}, response);
  }
};

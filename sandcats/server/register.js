function finishResponse(status, jsonData, response, plainTextOnly) {
  if (plainTextOnly) {
    // If the client really really wants plain text, then we hope that
    // the jsonData object has a 'text' property.
    //
    // If it doesn't, we might as well print the whole JSON blob.
    //
    response.writeHead(status, {'Content-Type': 'text/plain'});
    if ('text' in jsonData) {
      response.end(jsonData.text);
      return;
    } else {
      // TODO: Log those situations.
      response.end(JSON.stringify(jsonData));
      return;
    }
  }

  // Otherwise, send full status in JSON.
  response.writeHead(status, {'Content-Type': 'text/json'});
  response.end(JSON.stringify(jsonData));
}

function responseFromFormFailure(validatedFormData) {
  var response = {error: validatedFormData.errors};

  if (validatedFormData.errors &&
      validatedFormData.errors.rawHostname &&
      validatedFormData.errors.rawHostname.hostnameUnused) {
    response['text'] = (
      'This hostname is already in use. Try a new name.');
  }

  // The response['text'] is information that we show to a person
  // using the Sandstorm installer as their Sandcats client.
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

function wantsPlainText(request) {
  // If the HTTP client can only handle a text/plain response, the
  // Sandcats code honors that by throwing away everything but the
  // 'text' key in the object we were going to respond with.
  //
  // The one client that uses this is the Sandstorm installer, which
  // (powered by curl and bash) serves as a simplistic command line
  // interface to Sandcats.
  if (request.headers['accept'] === 'text/plain') {
    return true;
  }
  return false;
}

doRegister = function(request, response) {
  console.log("PARTY TIME");

  var requestEnded = antiCsrf(request, response);
  if (requestEnded) {
    return;
  }

  var rawFormData = getFormDataFromRequest(request);
  var plainTextOnly = wantsPlainText(request);

  var validatedFormData = Mesosphere.registerForm.validate(rawFormData);
  if (validatedFormData.errors) {
    return finishResponse(400,
                          responseFromFormFailure(validatedFormData),
                          response,
                          plainTextOnly);
  }

  // Great! It passed all our validation, including the
  // Sandcats-specific validation. In that case, let's store an item
  // in our Mongo collection and also update DNS.
  createUserRegistration(validatedFormData.formData);

  // Give the user an indication of our success.
  return finishResponse(200, {
    'success': true, 'text': "Successfully registered!"
  }, response, plainTextOnly);
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

  // So far, all consumers of doUpdate know how to understand JSON.
  //
  // Therefore, we do not need to support the plain text output format
  // that doRegister() needs.
  var plainTextOnly = false;

  var rawFormData = getFormDataFromRequest(request);

  var validatedFormData = Mesosphere.updateForm.validate(rawFormData);
  if (validatedFormData.errors) {
    return finishResponse(400,
                          responseFromFormFailure(validatedFormData),
                          response,
                          plainTextOnly);
  }

  if (validatedFormData.formData.updateIsAuthorized) {
    updateUserRegistration(validatedFormData.formData);
    return finishResponse(200, {'text': 'Update successful.'}, response, plainTextOnly);
  } else {
    return finishResponse(403, {'error': 'Not authorized.'}, response, plainTextOnly);
  }
};

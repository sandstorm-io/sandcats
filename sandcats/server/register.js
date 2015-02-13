function finishResponse(status, text, response) {
  response.writeHead(status, {'Content-Type': 'text/json'});
  response.end(JSON.stringify(response));
}

doRegister = function(request, response) {
  // Two mini anti-cross-site request forgery checks: POST and a
  // custom HTTP header.
  if (request.method != 'POST') {
    return finishResponse(400, {'error': 'Must POST.'}, response);
  }
  if (request.headers['x-sand'] != 'cats') {
    return finishResponse(403, {'error': 'Must have x-sand: cats header.'}, response);
  }

  // Before validating the form, we add an IP address field to it.
  var clientIp = request.connection.remoteAddress;

  // The form data is the request body, plus some extra data that we
  // add as if the user submitted it, for convenience of our own
  // processing.
  var rawFormData = _.clone(request.body);
  rawFormData.ipAddress = clientIp;

  var validatedFormData = Mesosphere.registerForm.validate(rawFormData);
  if (validatedFormData.errors) {
    return finishResponse(400, {'error': validatedForm.errors}, response);
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
  var publicKeyId = publicKeyToFingerprint(
    pemToPublicKeyOrFalse(formData.pubkey));

  var userRegistrationId = UserRegistrations.insert({
    hostname: formData.rawHostname,
    ipAddress: formData.ipAddress,
    fullPublicKeyPem: formData.pubkey,
    publicKeyId: publicKeyId,
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

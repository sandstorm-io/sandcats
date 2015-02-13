doRegister = function(request, response) {
  // Before validating the form, we add an IP address field to it.
  var clientIp = request.connection.remoteAddress;
  var rawFormData = _.clone(request.body); // copy
  rawFormData.ipAddress = clientIp;

  var validatedFormData = Mesosphere.registerForm.validate(rawFormData);
  if (validatedFormData.errors) {
    response.writeHead(400, {'Content-Type': 'text/json'});
    response.end(JSON.stringify(validatedFormData.errors));
    return;
  }

  // Great! It passed all our validation, including the
  // Sandcats-specific validation. In that case, let's store an item
  // in our Mongo collection and also update DNS.
  createUserRegistration(validatedFormData.formData);

  // in request.body, we will find a Javascript object
  response.writeHead(200, {'Content-Type': 'text/json'});
  response.end(JSON.stringify({'success': true}));
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

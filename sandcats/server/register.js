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

  // The response['text'] is information that we show to a person
  // using the Sandstorm installer as their Sandcats client.

  if (validatedFormData.errors) {
    if (validatedFormData.errors.email &&
        validatedFormData.errors.email['Invalid format']) {
      response['text'] = (
        'Please enter a valid email address.'
      );
    }

    if (validatedFormData.errors.rawHostname &&
        validatedFormData.errors.rawHostname.hostnameUnused) {
      response['text'] = (
        'This hostname is already in use. Try a new name.');
    }

    if (validatedFormData.errors.pubkey) {
      if (validatedFormData.errors.pubkey.required) {
        response['text'] = (
          'Your client is misconfigured. You need to provide a client certificate.');
      }

      if (validatedFormData.errors.pubkey.keyFingerprintUnique) {
        response['text'] = (
          'There is already a domain registered with this sandcats key. If you are re-installing, you can skip the Sandcats configuration process.'
        );
      }
    }
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
  console.log("Beginning registration.");

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

doSendRecoveryToken = function(request, response) {
  // Somewhat strangely, the way this function is written, anyone
  // can request a recoveryToken sent to the email address on file
  // for any domain.
  //
  // That could lead to a bit of abuse, where someone causes lots
  // of emails to get sent.
  //
  // To guard individual users from a lot of abuse on this front, we
  // establish a best-effort in-memory log of the two most recent
  // times that a password reset token was emailed to a user. Read
  // more about that in okToSendRecoveryToken() in validation.js.
  var i = 0;

  console.log("Received request for recovery token");

  var requestEnded = antiCsrf(request, response);

  if (requestEnded) {
    return;
  }

  var rawFormData = getFormDataFromRequest(request);
  var plainTextOnly = wantsPlainText(request);

  var validatedFormData = Mesosphere.recoverytokenForm.validate(rawFormData);
  if (validatedFormData.errors) {
    return finishResponse(400,
                          responseFromFormFailure(validatedFormData),
                          response,
                          plainTextOnly);
  }

  if (validatedFormData.formData.okToSendRecoveryToken) {
    // Get the corresponding UserRegistration object, and then
    // give it a fresh recoveryData attribute.
    var recoveryToken = addRecoveryData(validatedFormData.formData);

    var userRegistration = UserRegistrations.findOne({
      hostname: validatedFormData.formData.rawHostname});

    SSR.compileTemplate('recoveryTokenEmail', Assets.getText('recoveryTokenEmail.txt'));

    var emailBody = SSR.render("recoveryTokenEmail", {
      recoveryToken: recoveryToken,
      hostname: userRegistration.hostname
    });

    // Send the user an email with this token.
    Email.send({
      from: Meteor.settings.EMAIL_FROM_ADDRESS,
      to: userRegistration.emailAddress,
      subject: "Recovering your domain name",
      text: emailBody,
      headers: {
        // This header is used by the automated test suite, to avoid
        // having to parse the body of the email.
        'X-Sandcats-recoveryToken': recoveryToken,
        // We set these headers to avoid email auto-replies from people
        // who are on vacation, etc.
        //
        // See e.g.,
        // http://blogs.technet.com/b/exchange/archive/2006/10/06/3395024.aspx
        // https://tools.ietf.org/rfc/rfc3834.txt
        'Precedence': 'bulk',
        'Auto-Submitted': 'auto-generated',
        'Auto-Response-Suppress': 'OOF'}
    });

    console.log("Sent recovery token email for " + validatedFormData.formData.rawHostname);
    return finishResponse(200, {'text': 'OK! Sent a recovery token to your email.'}, response, plainTextOnly);
  } else {
    console.log("Recovery not OK!");
    return finishResponse(200, {'text': 'Too many attempts recently. Wait 15 minutes.'}, response, plainTextOnly);
  }
}

doRecover = function(request, response) {
  // If you call this with a request that contains:
  //
  // - A valid recoveryToken for a domain, and
  // - With a valid client cert,
  //
  // then this updates the domain to have the IP address that is
  // making the request.
  //
  // This is separate from doUpdate() and doRegister() to avoid
  // complicated if-else logic that could lead to careless bugs that
  // could lead to security issues.
  console.log("Received request to recover domain");

  var requestEnded = antiCsrf(request, response);
  if (requestEnded) {
    return;
  }

  var rawFormData = getFormDataFromRequest(request);
  var plainTextOnly = wantsPlainText(request);

  var validatedFormData = Mesosphere.recoverDomainForm.validate(rawFormData);
  if (validatedFormData.errors) {
    return finishResponse(400,
                          responseFromFormFailure(validatedFormData),
                          response,
                          plainTextOnly);
  }

  if (validatedFormData.formData.recoveryIsAuthorized) {
    // OK. Let's update the domain to have this new key.
    console.log("Recovery authorized. Updating " + validatedFormData.formData.rawHostname);

    UserRegistrations.update({
      hostname: validatedFormData.formData.rawHostname
    }, {$set: {
      // Actually update the domain to use the new key.
      publicKeyId: validatedFormData.formData.pubkey,
      // Throw away the recovery data, so it can't be used twice.
      recoveryData: null
    }});

    var userRegistration = UserRegistrations.findOne({
      hostname: validatedFormData.formData.rawHostname
    });

    SSR.compileTemplate('recoverySuccessfulEmail', Assets.getText('recoverySuccessfulEmail.txt'));

    var emailBody = SSR.render("recoverySuccessfulEmail", {
      hostname: userRegistration.hostname
    });

    // Send the user an email saying that their domain was recovered.
    Email.send({
      from: Meteor.settings.EMAIL_FROM_ADDRESS,
      to: userRegistration.emailAddress,
      subject: "You successfully recovered your domain name",
      text: emailBody,
      headers: {
        // We set these headers to avoid email auto-replies from
        // people who are on vacation, etc.
        //
        // See e.g.,
        // http://blogs.technet.com/b/exchange/archive/2006/10/06/3395024.aspx
        // https://tools.ietf.org/rfc/rfc3834.txt
        'Precedence': 'bulk',
        'Auto-Submitted': 'auto-generated',
        'Auto-Response-Suppress': 'OOF'}
    });
    return finishResponse(200, {'text': 'OK! You have recovered your domain.'}, response, plainTextOnly);
  } else {
    console.log("Recovery not authorized for " + validatedFormData.formData.rawHostname);
    return finishResponse(400, {'text': 'Bad recovery token.'}, response, plainTextOnly);
  }
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

function addRecoveryData(formData) {
  // The recoveryData attribute of UserRegistration stores information
  // that can be used to call the "recover" method on a domain that is
  // already registered. The purpose is to let people use this to get
  // access to a domain they registered, but lost the key for, so long
  // as we can send them a token by email.

  // Generate some recovery data.
  var recoveryData = {}
  recoveryData.recoveryToken = Random.id(40);
  recoveryData.timestamp = new Date();

  // Always just toss it onto the corresponding UserRegistration
  // record. (We will only send the recoveryToken to email address
  // on file.)
  UserRegistrations.update({
    hostname: formData.rawHostname
  }, {$set: {recoveryData: recoveryData}});

  // Return the recoveryToken so that the caller can place it in email
  // headers, etc.
  return recoveryData.recoveryToken;
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
  console.log('hi 1');
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

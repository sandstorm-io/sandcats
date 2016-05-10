finishResponse = function(status, jsonData, response, plainTextOnly) {
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

responseFromFormFailure = function(validatedFormData) {
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
        'This hostname is already in use. Type help if you need to recover access, or pick a new one.');
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

antiCsrf = function(request, response) {
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

getFormDataFromRequest = function(request) {
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

getClientIpFromRequest = function(request) {
  // The X-Real-IP header contains the client's IP address, and since
  // it's a non-standard header, the Meteor built-in proxy does not
  // mess with it. We assume nginx is going to give this to us.
  var clientIp = request.headers['x-real-ip'] || "";
  return clientIp || "";
}

wantsPlainText = function(request) {
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
    'success': true, 'text': "Successfully registered!",
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

  // If the form data refers to a domain name that does not exist,
  // then bail out now.
  if (! validatedFormData.formData.domainExistsSoCanBeRecovered) {
    return finishResponse(400,
                          {'text': 'There is no such domain. You can register it!'},
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
    return finishResponse(200, {'text': 'OK! You have recovered your domain. Next we will update your IP address.'}, response, plainTextOnly);
  } else {
    console.log("Recovery not authorized for " + validatedFormData.formData.rawHostname);
    return finishResponse(400, {'text': 'Bad recovery token.'}, response, plainTextOnly);
  }
}

createUserRegistration = function(formData) {
  // To create a user registration, we mostly copy data from the form. We allow SimpleSchema to
  // validate it.
  var userRegistrationId = UserRegistrations.insert({
    hostname: formData.rawHostname,
    ipAddress: formData.ipAddress,
    publicKeyId: formData.pubkey,
    emailAddress: formData.email
  });

  // Make sure it stuck, and log that it worked.
  var userRegistration = UserRegistrations.findOne({_id: userRegistrationId});
  console.log("Created UserRegistration with these details: %s",
              JSON.stringify(userRegistration));

  // Publish the UserRegistration to DNS.
  publishOneUserRegistrationToDns(
    mysqlQuery,
    userRegistration.hostname,
    userRegistration.ipAddress);
  // TODO(someday): We could send a confirmation email if we wanted.
}

generateRecoveryData = function() {
  var recoveryData = {}
  recoveryData.recoveryToken = Random.id(40);
  recoveryData.timestamp = new Date();
  return recoveryData;
}

function addRecoveryData(formData) {
  // The recoveryData attribute of UserRegistration stores information
  // that can be used to call the "recover" method on a domain that is
  // already registered. The purpose is to let people use this to get
  // access to a domain they registered, but lost the key for, so long
  // as we can send them a token by email.

  // Generate some recovery data.
  var recoveryData = generateRecoveryData();

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
  var requestEnded = antiCsrf(request, response);
  if (requestEnded) {
    return;
  }

  // doUpdate is used both by the Sandstorm (C++/JS) code as well as
  // the install script (as part of the domain recovery flow), so we
  // do the same thing as usual to support plain text output.
  var plainTextOnly = wantsPlainText(request);

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

doGetCertificate = function(request, response) {
  var requestEnded = antiCsrf(request, response);
  if (requestEnded) {
    return;
  }

  // doGetCertificate is only used by the Sandstorm JS flow, and does
  // not need to support plain-text output.
  var plainTextOnly = false;

  var rawFormData = getFormDataFromRequest(request);
  var validatedFormData = Mesosphere.getCertificate.validate(rawFormData);

  // If there are any outright errors, respond with that.
  if (validatedFormData.errors) {
    return finishResponse(400,
                          responseFromFormFailure(validatedFormData),
                          response,
                          plainTextOnly);
  }

  // If the response is not authorized, e.g. uses wrong client
  // certificate, respond with that.
  if (! validatedFormData.formData.isAuthorized) {
    return finishResponse(403,
                          {'error': 'Not authorized.'},
                          response,
                          plainTextOnly);
  }

  // If we got this far, things look good! Let's log a note saying we're
  // going to ask GlobalSign for the certificate.

  // Send the request to GlobalSign. Note that this seems to take
  // about 30 seconds.
  var hostname = validatedFormData.formData.rawHostname;
  var devOrProd = getDevOrProdByHostname(hostname);
  var intendedUseDurationDays = 7; // At the moment, we want one-week certificates

  // Calculate parameters (specifically for custom validity period) to
  // send as part of the GlobalSign certificate order.
  var csrText = validatedFormData.formData.certificateSigningRequest;
  var orderRequestParameter = getOrderRequestParameter(csrText);

  // Before actually sending it, log a note that we are about to send
  // it.
  var logEntryId = logIssueCertificateStart(
    devOrProd, orderRequestParameter, intendedUseDurationDays, hostname);
  // Send it to GlobalSign & capture response.
  var globalsignResponse = issueCertificate(csrText, devOrProd, orderRequestParameter);
  // Pass the response to a helper that logs the response to Mongo
  // then passes the info to the user.
  return finishGlobalsignResponse(globalsignResponse, response, logEntryId);
};

finishGlobalsignResponse = function(globalsignResponse, responseCallback, logEntryId) {
  if (globalsignResponse.Response.OrderResponseHeader.SuccessCode != 0) {

    // If the first error code is -9978, this is a spurious GlobalSign half-rejection of a commonName
    // that starts with `*`. FWIW they do actually return a certificate; they just provide an error
    // message as well. Weirdly, they didn't used to do this. Also weirdly, this only seems to happen
    // for domains that are already registered, aka our pseudo-renewals. (Pseudo-renewals because this
    // code always requests a "new" certificate via the GlobalSign API, for implementation simplicity.)
    var ignoreError = false;
    if (globalsignResponse.Response &&
	globalsignResponse.Response.OrderResponseHeader &&
	globalsignResponse.Response.OrderResponseHeader.Errors &&
	globalsignResponse.Response.OrderResponseHeader.Errors.Error &&
	globalsignResponse.Response.OrderResponseHeader.Errors.Error[0] &&
	globalsignResponse.Response.OrderResponseHeader.Errors.Error[0].ErrorCode &&
	globalsignResponse.Response.OrderResponseHeader.Errors.Error[0].ErrorCode === "-9978") {
      console.log("[pseudo-error] found -9978, acting as though there was no error at all.");
      console.log("[pseudo-error] BTW, true/false: Did we find an actual certificate in the response?",
		  !! (globalsignResponse.Response &&
		      globalsignResponse.Response.PVOrderDetail &&
		      globalsignResponse.Response.PVOrderDetail.Fulfillment &&
		      globalsignResponse.Response.PVOrderDetail.Fulfillment.ServerCertificate &&
		      globalsignResponse.Response.PVOrderDetail.Fulfillment.ServerCertificate.X509Cert));
      ignoreError = true;
    }

    var responseStringified = "(attempting to stringify...)";
    try {
      responseStringified = JSON.stringify(globalsignResponse);
    } catch (e) {
      console.error("Eek, failed to stringify response", e);
    }
    console.log("Aiee, logging full non-success GlobalSign response", responseStringified);
    var errors = globalsignResponse.Response.OrderResponseHeader.Errors;
    if (errors && logEntryId) {
      logIssueCertificateErrors(errors, logEntryId);
    } else {
      console.error(JSON.stringify(errors));
    }
    if (ignoreError) {
      console.log("Continuing despite error.");
    } else {
      return finishResponse(500, {'error': 'Server error'}, responseCallback, false);
    }
  }

  var cert = globalsignResponse.Response.PVOrderDetail.Fulfillment.ServerCertificate.X509Cert;
  var ca = [];
  if (globalsignResponse.Response.PVOrderDetail.Fulfillment.CACertificates) {
    var globalsignCaCertificates = globalsignResponse.Response.PVOrderDetail.Fulfillment.CACertificates.CACertificate;
    for (var i = 0; i < globalsignCaCertificates.length; i++) {
      ca.push(globalsignCaCertificates[i].CACert);
    }
  }

  // Before returning it, add a note to Mongo.
  if (logEntryId) {
    logIssueCertificateSuccess(globalsignResponse, logEntryId);
  } else {
    console.error("No logEntryId, so here was the response: " +
                  globalsignResponse);
  }
  return finishResponse(200, {'cert': cert, 'ca': ca}, responseCallback, false);
};

getTestCSR = function() {
  return Assets.getText('exampleuser2.sandcatz.io.csr');
};

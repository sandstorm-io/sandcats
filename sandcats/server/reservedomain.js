// This file contains the functions that handle tasks related to reserving domain names with a
// token.

// Create validator for turning a domainReservationToken into a registered domain.
//
// If a user gives us a valid form like this, we create a domain on their behalf. We need less info
// in this, compared to registerForm, because the personal info was already submitted as part of
// reserving the domain name.
Mesosphere({
  name: 'reservedDomainRegisterForm',
  fields: {
    domainReservationToken: {
      required: true,
      format: /^[0-9a-zA-Z-]+$/,
      rules: {
        minLength: 40,
        maxLength: 40
      },
    },
    rawHostname: {
      required: true,
      format: /^[0-9a-zA-Z-]+$/,
      transforms: ["clean", "toLowerCase"],
      rules: {
        minLength: 1,
        maxLength: 20
      }
    },
    pubkey: {
      required: true,
      rules: {
        minLength: 40,
        maxLength: 40,
        keyFingerprintUnique: true
      },
    }
  },
  aggregates: {
    domainReservationTokenUseIsAuthorized: ['domainReservationTokenUseIsAuthorized',
                                             ['rawHostname', 'domainReservationToken']]
  }
});

// Give the user half an hour to use this token. They had better hurry.
var MAX_STALENESS_IN_SECONDS = 30 * 60;
var domainReservationTokenHasAcceptableStaleness = makeTokenExpirationChecker(
  MAX_STALENESS_IN_SECONDS);


Mesosphere.registerAggregate('domainReservationTokenUseIsAuthorized', function(fields, formFieldsObject) {
  // Using a domain registration token is authorized under the following circumstances.
  //
  // - The domain in question has an entry in DomainReservations.
  //
  // - The object has a recoveryData attribute.
  //
  // - The recoveryData's timestamp is less than RECOVERY_TIME_PERIOD_IN_SECONDS old.
  //
  // - The recoveryToken we are given is the same as the one in the recoveryData.
  var datum = DomainReservations.findOne({'hostname': formFieldsObject.rawHostname});

  if (! datum) {
    return false;
  }

  var recoveryData = datum.recoveryData;
  if (! recoveryData) {
    return false;
  }

  if (! domainReservationTokenHasAcceptableStaleness(recoveryData)) {
    return false;
  }

  if (formFieldsObject.domainReservationToken == recoveryData.recoveryToken) {
    return true;  // hooray!
  }

  return false;
});

// HTTP response functions, aka "views".

doRegisterReserved = function(request, response) {
  // This gets called via install.sh, when someone wants to actually register a domain they've
  // reserved.
  //
  // - Client submits a form that is basically the same as recover, but using a
  //   domainReservationToken.
  //
  // - We create their domain for them.
  console.log("Beginning registration of reserved domain.");

  var requestEnded = antiCsrf(request, response);
  if (requestEnded) {
    return;
  }

  var rawFormData = getFormDataFromRequest(request);
  var plainTextOnly = wantsPlainText(request);

  var validatedFormData = Mesosphere.reservedDomainRegisterForm.validate(rawFormData);
  if (validatedFormData.errors) {
    return finishResponse(400,
                          responseFromFormFailure(validatedFormData),
                          response,
                          plainTextOnly);
  }
  if (! validatedFormData.formData.domainReservationTokenUseIsAuthorized) {
    return finishResponse(400, {
      'text':
      'Bad domainReservationToken. If you are an end user, contact your Sandstorm hosting provider.'
    }, response, plainTextOnly);
  }

  // Great! It passed all our validation. Enrich the submitted form with information
  // from DomainReservations.
  var reservation = DomainReservations.findOne({
    "recoveryData.recoveryToken": validatedFormData.formData.domainReservationToken,
    "hostname": validatedFormData.formData.rawHostname,
  });
  if (! reservation) {
    console.log("*** ERROR ***: Ran into a mis-hap while attempting to register reserved domain.");
    console.log("Form submission:", JSON.stringify(validatedFormData));
    return finishResponse(500, {
      'text': 'Server error E101. Please email support@sandstorm.io to get help.'
    }, response, plainTextOnly);
  }

  var userRegistration = {
    rawHostname: validatedFormData.formData.rawHostname,
    ipAddress: validatedFormData.formData.ipAddress,
    pubkey: validatedFormData.formData.pubkey,
    email: reservation.emailAddress,
  };

  createUserRegistration(userRegistration);

  // Now that we've registered them, destroy the reservation.
  DomainReservations.remove({_id: reservation._id});

  // Give the user an indication of our success.
  return finishResponse(200, {
    'success': true, 'text': "Successfully registered!",
  }, response, plainTextOnly);

}


doReserve = function(request, response) {
  // Reserving a domain name is where you give us a name+email address for a domain, and get a
  // recoveryToken back (which we call a domainReservationToken). We don't create a real
  // UserRegistration and we don't store any client cert.
  //
  // Everyone is allowed to reserve a domain. This creates a DomainReservations document whose
  // recoveryToken data hints at a timestamp.
  //
  // In the future, we might:
  //
  // - Limit which IP addresses can use this API
  //
  // - Ask people to register with us before using it
  //
  // But for now, enjoy the free-for-all.
  console.log("Beginning domain reservation process.");

  // Unlike other service endpoints, doReserve is allowed to be accessed via a browser. So we skip
  // the check for the ability to send a custom header. We do still check that this is a POST.
  if (request.method != 'POST') {
    return;
  }

  // The purpose of this endpoint is to generate a token that is consumed by Javascript operating on
  // an arbitrary origin. So allow it.
  response.setHeader('Access-Control-Allow-Origin', '*');

  // By the way, you might wonder - won't browsers attempt to submit a client certificate if they
  // have one? The answer is "No, so long as {withCredentials: false} is part of the XMLHttpRequest
  // invocation."

  var plainTextOnly = false;
  var rawFormData = getFormDataFromRequest(request);
  var validatedFormData = Mesosphere.reserveForm.validate(rawFormData);
  if (validatedFormData.errors) {
    return finishResponse(400,
                          responseFromFormFailure(validatedFormData),
                          response,
                          plainTextOnly);
  }

  // Great! It passed all our validation. Let's reserve the domain.
  var recoveryToken = createDomainReservation(validatedFormData.formData);

  // Give the user an indication of our success.
  return finishResponse(200, {
    'success': true, 'text': "Successfully registered!",
    'token': recoveryToken,
  }, response, plainTextOnly);
}



// Functions to actually store data in the database.
function createDomainReservation(formData) {
  console.log("Reserving domain with data", JSON.stringify(formData));
  var recoveryData = generateRecoveryData();
  var domainReservationId = DomainReservations.insert({
    hostname: formData.rawHostname,
    emailAddress: formData.email,
    recoveryData: recoveryData
  });
  return recoveryData.recoveryToken;
}

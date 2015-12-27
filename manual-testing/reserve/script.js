// This is a script you can copy-paste/change into your own code.
//
// Goal: When the user clicks "Create VM":
//
// 1. Validate that the email and hostname are sensible.
//
// 2. Submit the hostname and email to the sandcats API and get a domain reservation token.
//
// 3. Print the token to the "Debug info" area of the page, contextualized with the right install.sh
//    invocation to cause the install to actually happen. (In a hosting company's implementation of
//    this script, you would actually run the install.)
//
// 4. Print a URL that the VM would be accessible at to the "Debug info" area of the page. (In a
//    hosting company's implementation of this script, you would probably still want to print this
//    URL to the screen.)
//
// 5. Print example SSH information to the screen. (In a hosting company's implementation, maybe you
//    want a form where the user can choose which SSH key to add to the root account.)

// Set isProd to true when you want to create hostnames on the production sandcats.io domain. Until
// then, we create hostnames on the dev instance, of the form username.sandcats-dev.sandstorm.io.

var isProd = false;
if (isProd) {
  var SANDCATS_ENDPOINT_URL = "https://sandcats.io";
  var SANDCATS_BASE_DOMAIN = "sandcats.io";
} else {
  var SANDCATS_ENDPOINT_URL = "https://sandcats-dev-machine.sandstorm.io";
  var SANDCATS_BASE_DOMAIN = "sandcats-dev.sandstorm.io";
}

$(function() {
  // Change sandcats base domain in the page to be based on the above configuration, so that
  // dev mode and prod mode are visually distinguished.
  $('.sandcats-base-domain').text(SANDCATS_BASE_DOMAIN);

  $('button[type=submit]').click(
    function(event) {
      // Handle the click from this Javascript code, and ignore the default handler.
      event.preventDefault();

      // Go through all the steps. Steps can bail out by throwing an exception, but they should
      // first print information about the failure into the Debug Info area.
      showDebugInfo();
      validateEmail();
      validateHostname();
      validateSandcatsTos();
      sendDomainReservationRequest();
    });
});

function showDebugInfo() {
  $('.hide-after-submit').addClass('hidden');
}

function fail(msg) {
  alert(msg);
  throw msg;
}

function validateEmail() {
  $('ul.steps li.validate-email').removeClass('hidden');
  var email = $('#inputEmail').val();
  if (email && email.length > 0 && email.indexOf("@") > 0) {
    return;
  }

  fail("Need a valid email address.");
}

function validateHostname() {
  // Similar to the sandcats_register_name() function in install.sh, this function validates a
  // hostname against a semi-rigorous regular expression, but the sandcats.io service has a few more
  // restrictions. This is mostly just to make sure they entered something plausible.
  //
  // Relevant information:
  //
  // - https://install.sandstorm.io/ contains the current version of the install script
  //
  // - https://github.com/sandstorm-io/sandstorm/blob/master/install.sh is the github view of the
  //   same file
  //
  // Search that file for the text "regex" to see why it does what it does.
  //
  // The full check can be found here https://github.com/sandstorm-io/sandcats/blob/master/sandcats/lib/validation.js,
  // specifically:
  //
  // - Validation is first done against a regex (search for "format" within the "registerForm"
  //   validator).
  //
  // - Then we check that the hostname is unused (search for "hostnameUnused" to read the function),
  //   including checking against blacklisted domains.
  //
  // - Then we check for hyphens in weird places (search for "extraHyphenRegexes" to read the
  //   function).
  var sanityCheckRegex = /^[0-9a-zA-Z-]{1,20}$/;
  $('ul.steps li.validate-hostname').removeClass('hidden');
  var hostname = $('#inputHostname').val();
  if (hostname.match(sanityCheckRegex)) {
    return;
  }

  fail("Need a valid hostname");
}

function validateSandcatsTos() {
  $('ul.steps li.validate-sandcats-tos').removeClass('hidden');
  // Use the :checked pseudo-class because otherwise the value is always taken from the value
  // property of the input element.
  var tos = $('#inputTos:checked').val();
  if (tos === "yes") {
    return;
  }
  fail("Need to agree to terms of service and privacy policy.");
}

function generateAdminToken() {
  var adminToken = "";
  if (window.crypto) {
    var array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    var base64encoded = btoa(String.fromCharCode.apply(null, array));
    // Remove characters we do not care about. Since no one decodes this, it is fine to do this.
    adminToken = base64encoded.replace(/([+\/=])*/g, '');
  } else {
    fail("Failed due to crypto.getRandomValues() being missing. See http://caniuse.com/#feat=getrandomvalues");
  }

  $('.admin-token').text(adminToken);
  $('.got-token').removeClass('hidden');
  $('.got-admin-token').removeClass('hidden');
};

function sendDomainReservationRequest() {
  $('ul.steps li.reserve-domain-name').removeClass('hidden');
  if (! isProd) {
    $('.show-if-not-prod').removeClass('hidden');
  }
  var httpRequest = new XMLHttpRequest();
  httpRequest.onreadystatechange = function() {
    if (httpRequest.readyState === XMLHttpRequest.DONE) {
      if (httpRequest.status === 200) {
        var decoded;
        try {
          decoded = JSON.parse(httpRequest.responseText);
        } catch(e) {
          alert("Failure decoding JSON. Weird.");
          console.log(e);
          return;
        }

        // Since the domain was successfully reserved, it is safe to pass this along to the install script.
        $('.confirmed-sandcats-hostname').text($('#inputHostname').val());

        // Indicate that we got our domain reservation token.
        $('.got-token').removeClass('hidden');
        $('.domain-reservation-token').text(decoded['token']);

        // Now, generate a secret that sandcats.io doesn't know. The install script uses this as a
        // one-time password, basically.
        $('.generate-admin-token').removeClass('hidden');
        generateAdminToken();
        return;
      }

      // TODO: Implement smarter handling for these errors:
      //
      // - Domain is already taken.
      //
      // - Sandcats server is actually not online; got a timeout.
      alert("Something went wrong. Got status code " + httpRequest.status);
    }
  };

  var hostname = $('#inputHostname').val();
  var email = $('#inputEmail').val();

  // Implementation note: It is important to set the third parameter to open() to false, since the
  // third parameter is the withCredentials property of the XMLHTTPRequest. If withCredentials is
  // true, then mumble chrome bug.
  httpRequest.withCredentials = false;
  httpRequest.open('POST', SANDCATS_ENDPOINT_URL + '/reserve');
  httpRequest.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  httpRequest.send('rawHostname=' + encodeURIComponent(hostname) + '&' +
                   'email=' + encodeURIComponent(email));
};

function onDomainReservationRequestFailure(jqXHR, textStatus, errorThrown) {
  fail(textStatus + " - " + errorThrown);
}

function onDomainReservationRequestSuccess(jqXHR, textStatus, errorThrown) {
  alert('Successful domain reservation.');
  console.log(jqXHR);
}

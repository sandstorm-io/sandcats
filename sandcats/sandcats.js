if (Meteor.isServer) {

  function createUserRegistration(formData) {
    // To create a user registration, we mostly copy data from the form.
    // We do also need to store a public key "fingerprint", which for
    // now we calculated as deadbeaf.
    var publicKeyId = pemToPublicKeyFingerprint(formData.pubkey);

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
    console.log(JSON.stringify(userRegistration));
    publishOneUserRegistrationToDns(userRegistration.hostname,
                                    userRegistration.ipAddress);
  }

  function publishOneUserRegistrationToDns(hostname, ipAddress) {
    // Given a hostname, and an IP address, we set up wildcard
    // records accordingly in the PowerDNS database.
    //
    // Note that PowerDNS will cache DNS queries for ~20 seconds
    // (configurable) before it actually queries the SQL database to
    // find out what the new value is. This is on top of any TTL in
    // the DNS record itself, as I understand it.
    deleteRecordIfExists(connection, Meteor.settings.BASE_DOMAIN, hostname);

    createRecord(connection, Meteor.settings.BASE_DOMAIN, hostname + '.' + Meteor.settings.BASE_DOMAIN, 'A', ipAddress);
    createRecord(connection, Meteor.settings.BASE_DOMAIN, '*.' + hostname + '.' + Meteor.settings.BASE_DOMAIN, 'A', ipAddress);
  }

  function doRegister(clientIp, request, response) {
    // Before validating the form, we add an IP address field to it.
    console.log("woweee, " + clientIp);
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

  Meteor.startup(function () {
    // Validate that the config file contains the data we need.
    validateSettings();

    // Create our DNS zone for PowerDNS, if necessary.
    mysqlQuery = createWrappedQuery();
    createDomainIfNeeded(mysqlQuery);

    Router.map(function() {
      this.route('register', {
        path: '/register',
        where: 'server',
        action: function() {
          // GET, POST, PUT, DELETE
          var requestMethod = this.request.method;
          if (this.request.method == 'PUT' ||
              this.request.method == 'POST') {
            var clientIp = this.request.connection.remoteAddress;
            registerPostHandler(clientIp, this.request, this.response);
          }
        }
      });
    // code to run on server at startup
  });

  })
}

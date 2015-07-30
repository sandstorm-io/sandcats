var Fiber = Npm.require('fibers');
var fs = Npm.require('fs');

Jasmine.onTest(function () {
  var pem = Meteor.npmRequire('pem');

  describe('Register', function() {
    'use strict';

    var csr = fs.readFileSync('/vagrant/sandcats/exampleuser2.sandcatz.io.csr', {encoding: 'utf-8'});

    var formDataTemplate = {
      rawHostname: 'exampleuser1',
      pubkey: '1234567890123456789012345678901234567890'
    };

    function registerUser(hostname) {
      // For testing, we only have the one pubkey. This function
      // exists to register a domain (via Mongo) to that pubkey.
      UserRegistrations.insert({
        hostname: hostname,
        publicKeyId: formDataTemplate.pubkey,
        ipAddress: '128.151.2.1',  // placeholder IP address
        emailAddress: 'placeholder@example.com'
      });
    }

    describe('registerActionSignsCsr', function() {
      afterEach(function () {
        // This removes all data from the database that we insert as part of
        // test functions.
        UserRegistrations.remove({});
      });

      it('should not validate a cert request without a CSR', function() {
        var formData = _.clone(formDataTemplate);
        var validatedFormData = Mesosphere.getCertificate.validate(formData);
        expect(!! validatedFormData.errors).toBe(true);
      });

      it('should reject a certificate request with a CSR for the wrong domain + pubkey mismatch', function() {
        var formData = _.clone(formDataTemplate);
        // Attach a CSR for exampleuser2. We're exampleuser1 so that doesn't match.
        formData.certificateSigningRequest = csr;
        var validatedFormData = Mesosphere.getCertificate.validate(formData);
        expect(!! validatedFormData.errors).toBe(false, "Got errors: " + JSON.stringify(validatedFormData.errors));
        expect(!! validatedFormData.formData.isAuthorized).toBe(false, "Should not be authorized.");
      });

      it('should reject a certificate request with a CSR for the wrong domain + pubkey match', function() {
        var formData = _.clone(formDataTemplate);
        // Attach a CSR for exampleuser2. We're exampleuser1 so that doesn't match.
        formData.certificateSigningRequest = csr;
        // Make sure the user is registered.
        registerUser('exampleuser1');

        var validatedFormData = Mesosphere.getCertificate.validate(formData);
        expect(!! validatedFormData.errors).toBe(false, "Got errors: " + JSON.stringify(validatedFormData.errors));
        expect(!! validatedFormData.formData.isAuthorized).toBe(false, "Should not be authorized.");
      });

      it('should reject a certificate request with a CSR for the right domain + wrong pubkey', function() {
        var formData = _.clone(formDataTemplate);
        // Attach a valid CSR for exampleuser2 and set the hostname of this request
        // to be for exampleuser2.
        formData.certificateSigningRequest = csr;
        formData.rawHostname = 'exampleuser2';
        // Register a different user!
        registerUser('exampleuser1');

        var validatedFormData = Mesosphere.getCertificate.validate(formData);
        expect(!! validatedFormData.errors).toBe(false);
        expect(!! validatedFormData.formData.isAuthorized).toBe(false);
      });

      it('should accept a certificate request with a CSR for the right domain', function() {
        // Before we can actually submit this, we'd need a

        var formData = _.clone(formDataTemplate);
        // Attach a valid CSR for exampleuser2 and set the hostname of this request
        // to be for exampleuser2.
        formData.certificateSigningRequest = csr;
        formData.rawHostname = 'exampleuser2';
        // Register this user.
        registerUser(formData.rawHostname);

        var validatedFormData = Mesosphere.getCertificate.validate(formData);
        expect(!! validatedFormData.errors).toBe(false);
        expect(!! validatedFormData.formData.isAuthorized).toBe(true, "Should be authorized.");
      });

      it('should return a signed certificate for the domain', function() {
      });
    });
  });
});

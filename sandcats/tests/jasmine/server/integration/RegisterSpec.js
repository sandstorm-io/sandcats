var Fiber = Npm.require('fibers');
var fs = Npm.require('fs');

Jasmine.onTest(function () {
  var pem = Meteor.npmRequire('pem');

  describe('Register', function() {
    'use strict';

    var csr = fs.readFileSync('/vagrant/sandcats/exampleuser2.sandcatz.io.csr', {encoding: 'utf-8'});

    var validRegisterFormTemplate = {
      rawHostname: 'exampleuser1',
      ipAddress: '128.151.2.1',
      email: 'asheesh@localhost.uu.net',
      pubkey: '1234567890123456789012345678901234567890'
    };

    describe('registerActionSignsCsr', function() {
      it('should validate a register form without a CSR', function() {
        var validRegisterForm = _.clone(validRegisterFormTemplate);
        var validatedFormData = Mesosphere.registerForm.validate(validRegisterForm);
        expect(!! validatedFormData.errors).toBe(false);
      });

      it('should reject a register form with a CSR for the wrong domain', function() {
        var validRegisterForm = _.clone(validRegisterFormTemplate);
        // Attach a CSR for exampleuser2. We're exampleuser1 so that doesn't match.
        validRegisterForm.certificateSigningRequest = csr;
        var validatedFormData = Mesosphere.registerForm.validate(validRegisterForm);
        expect(!! validatedFormData.errors).toBe(false);
        expect(!! validatedFormData.formData.certificateIsUsable).toBe(false);
      });

      it('should accept a register form with a CSR for the right domain', function() {
        var validRegisterForm = _.clone(validRegisterFormTemplate);
        // Attach a valid CSR for exampleuser2 and set the hostname of this request
        // to be for exampleuser2.
        validRegisterForm.certificateSigningRequest = csr;
        validRegisterForm.rawHostname = 'exampleuser2';
        var validatedFormData = Mesosphere.registerForm.validate(validRegisterForm);
        expect(!! validatedFormData.errors).toBe(false);
        expect(!! validatedFormData.formData.certificateIsUsable).toBe(true);
      });
    });
  });
});

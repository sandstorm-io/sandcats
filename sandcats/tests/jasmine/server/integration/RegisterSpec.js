var Fiber = Npm.require('fibers');
var fs = Npm.require('fs');

Jasmine.onTest(function () {
  var stable_stringify = Meteor.npmRequire('json-stable-stringify');
  var pem = Meteor.npmRequire('pem');

  describe('Register', function() {
    'use strict';

    var csr = getTestCSR();

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

      it('should log errors if GlobalSign gives us errors', function() {
        var responseData = null;
        var mockResponse = (
          function() {
            return {
              writeHead: function() { /* ignored */ },
              end: function(data) { responseData = data; }
            };
          })();
        console.log = jasmine.createSpy('log');

        finishGlobalsignResponse({
          'Response': {
            'OrderResponseHeader': {
              'StatusCode': -1,
              'Errors': ['globalsign error text']}}},
                                 mockResponse);
        expect(stable_stringify(JSON.parse(responseData))).toBe(
          stable_stringify({'error': 'Server error'}));
        expect(console.log).toHaveBeenCalledWith(JSON.stringify(['globalsign error text']));
      });

      it('should return a certificate if there is one', function() {
        var responseData = null;
        var mockResponse = (
          function() {
            return {
              writeHead: function() { /* ignored */ },
              end: function(data) { responseData = data; }
            };
          })();
        var cert = '-----BEGIN CERTIFICATE-----\r\nMIIFaDCCBFCgAwIBAgIQMvEFlcrw7X8kOaXgD4wACDANBgkqhkiG9w0BAQUFADB/\r\nMQswCQYDVQQGEwJCRTEfMB0GA1UECxMWRm9yIFRlc3QgUHVycG9zZXMgT25seTEZ\r\nMBcGA1UEChMQR2xvYmFsU2lnbiBudi1zYTE0MDIGA1UEAxMrR2xvYmFsU2lnbiBP\r\ncmdhbml6YXRpb24gVmFsaWRhdGlvbiBDQVQgLSBHMjAeFw0xNTA4MTAyMDU0NDJa\r\nFw0xNTA4MjAwNDU5NTlaMIGFMQswCQYDVQQGEwJVUzETMBEGA1UECBMKQ2FsaWZv\r\ncm5pYTESMBAGA1UEBxMJUGFsbyBBbHRvMSowKAYDVQQKEyFTYW5kc3Rvcm0gRGV2\r\nZWxvcG1lbnQgR3JvdXAsIEluYy4xITAfBgNVBAMTGGp1c3QtdGVzdGluZy5zYW5k\r\nY2F0cy5pbzCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALnRmVGAepUZ\r\nd/9tOkab6sP9fWMxux+ejjlWqMxJ1hYS4TQRcYmxNdlMN8kNiUdZEzM82MXBo4YC\r\nBrVserjv+yIQ9WRTwfnRNCymSqhWTNX8tg+KlctbJ9rV9VgvaPXUBYtW/9PQjf9S\r\nX2stfmwhXebzVow1D0bndE6uxSUtBYRl/BSNHWD2gUvQn8VB2YioleBR5kfPrmnw\r\nTdpSjS4oFeU3qnsxisn14f3VGRvhScLv4U9VyZaS4H+xDcLe/ouvmJseGR5bdpyj\r\n4D3VZ1jC/3lP2TDYF9/T30Nn1W7OwkwjI85ndLfjzCUN+24tITylRKHhZeVjBaRy\r\ndaJsmCTc7CECAwEAAaOCAdcwggHTMA4GA1UdDwEB/wQEAwIFoDBJBgNVHSAEQjBA\r\nMD4GBmeBDAECAjA0MDIGCCsGAQUFBwIBFiZodHRwczovL3d3dy5nbG9iYWxzaWdu\r\nLmNvbS9yZXBvc2l0b3J5LzAjBgNVHREEHDAaghhqdXN0LXRlc3Rpbmcuc2FuZGNh\r\ndHMuaW8wCQYDVR0TBAIwADAdBgNVHSUEFjAUBggrBgEFBQcDAQYIKwYBBQUHAwIw\r\nSAYDVR0fBEEwPzA9oDugOYY3aHR0cDovL2NybC5nbG9iYWxzaWduLmNvbS9ncy9n\r\nc29yZ2FuaXphdGlvbnZhbGNhdGcyLmNybDCBnAYIKwYBBQUHAQEEgY8wgYwwSgYI\r\nKwYBBQUHMAKGPmh0dHA6Ly9zZWN1cmUuZ2xvYmFsc2lnbi5jb20vY2FjZXJ0L2dz\r\nb3JnYW5pemF0aW9udmFsY2F0ZzIuY3J0MD4GCCsGAQUFBzABhjJodHRwOi8vb2Nz\r\ncDIuZ2xvYmFsc2lnbi5jb20vZ3Nvcmdhbml6YXRpb252YWxjYXRnMjAdBgNVHQ4E\r\nFgQU3T3TARV/KBauY0hb/R2R5g76TmYwHwYDVR0jBBgwFoAUwIAS7yXnVMj6Akni\r\n92/ftKsEHq8wDQYJKoZIhvcNAQEFBQADggEBAH55Obs2FJ3HftclSAHZyg5KCZde\r\nejAo5qEO877UYUGAFPFNdFiYZ4Iclwl56f5gr4eYT2AMsKCVyFyLjpnmmpfFoH1T\r\nh8eQUVaeX+hPzIft3x8wmjrue3PB2EvdOIeLkqiATWW9W5ty+dhQFBo3+/IqnKM6\r\nauQ1MHpQyK/gijhvxsbOVLHf0VEfyPT2l5RmTwwoU+KA0o11IaOhuQhtJ0LJszP5\r\n0pMExmvb1G3BCMfTKoKtRbDx6yxNLt8Uy6UpThy+/1X+peKV/aYEBSpOXYJiaqgY\r\n773S966a1QWM1Z9Pgn4Cux4mOJ3SOigMFEGu0ke+1ksUqUjTyzokM9fOvdI=\r\n-----END CERTIFICATE-----';

        finishGlobalsignResponse({
          'Response': {
            'OrderResponseHeader': {
              'SuccessCode': 0},
            'PVOrderDetail': {
              'Fulfillment': {
                'CACertificates': {
                  'CACertificate': [
                    {'CACert': '1'},
                    {'CACert': '2'}]},
                'ServerCertificate': {
                  'X509Cert': cert
                }}}}},
                                 mockResponse);
        expect(stable_stringify(JSON.parse(responseData))).toBe(
          stable_stringify({'cert': cert, ca: ['1', '2']}));
      });

      it('time to exit', function() {
        // See input-filter.py for the need for this. Sad but OK.
      });
    });
  });
});

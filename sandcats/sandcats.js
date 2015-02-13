if (Meteor.isServer) {

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
          doRegister(this.request, this.response);
        }
      });

      var clientCertificateAuth = Meteor.npmRequire('client-certificate-auth');
      function checkAuth(cert) {
        console.log(cert.fingerprint);
      }

      WebApp.connectHandlers.use(clientCertificateAuth(checkAuth));

      this.route('update', {
        path: '/update',
        where: 'server',
        action: function() {
          doUpdate(this.request, this.response);
        }
      });
    });
  });
}

if (Meteor.isServer) {
  Meteor.startup(function () {
    // Validate that the config file contains the data we need.
    validateSettings();

    // Create our DNS zone for PowerDNS, if necessary.
    mysqlQuery = createWrappedQuery();
    createDomainIfNeeded(mysqlQuery);

    // Bind handlers for UDP-based client ping system.
    startListeningForUdpPings();
  });
}

// Always route all URLs, though we carefully set where: 'server' for
// HTTP API-type URL handling.

Router.map(function() {
  // Provide a trivial front page, to avoid the Iron Router default.
  this.route('root', {
    path: '/'
  });

  this.route('register', {
    path: '/register',
    where: 'server',
    action: function() {
      doRegister(this.request, this.response);
    }
  });

  this.route('sendrecoverytoken', {
    path: '/sendrecoverytoken',
    where: 'server',
    action: function() {
      doSendRecoveryToken(this.request, this.response);
    }
  });

  this.route('recover', {
    path: '/recover',
    where: 'server',
    action: function() {
      doRecover(this.request, this.response);
    }
  });

  this.route('update', {
    path: '/update',
    where: 'server',
    action: function() {
      doUpdate(this.request, this.response);
    }
  });
});

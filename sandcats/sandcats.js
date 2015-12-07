if (Meteor.isServer) {
  Meteor.startup(function () {
    // Validate that the config file contains the data we need.
    validateSettings();

    /* In the mirror process for running automated tests, do not do
     * PowerDNS setup nor UDP pings setup. */
    if (process.env.IS_MIRROR) {
      return;
    }

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
  // Redirect the front page to the Sandstorm documentation.
  this.route('root', {
    path: '/',
    where: 'server',
    action: function() {
      this.response.writeHead(302, {
        'Location': 'https://docs.sandstorm.io/en/latest/administering/sandcats/'
      });
      this.response.end();
    }
  });

  this.route('crashforlocalhost', {
    path: '/crashforlocalhost',
    where: 'server',
    action: function() {
      if ((this.request.headers['x-real-ip'] === '127.0.0.1') ||
          (this.request.headers['x-real-ip'] === '10.0.2.2')) {
        throw new Error("This view crashes when accessed via localhost. Use only for tests!");
      }
      this.response.end("You are accessing this from not-localhost. Hooray.");
    }
  });

  this.route('register', {
    path: '/register',
    where: 'server',
    action: function() {
      doRegister(this.request, this.response);
    }
  });

  this.route('reserve', {
    path: '/reserve',
    where: 'server',
    action: function() {
      doReserve(this.request, this.response);
    }
  });

  this.route('registerreserved', {
    path: '/registerreserved',
    where: 'server',
    action: function() {
      doRegisterReserved(this.request, this.response);
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

  this.route('getcertificate', {
    path: '/getcertificate',
    where: 'server',
    action: function() {
      doGetCertificate(this.request, this.response);
    }
  });
});

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
          var requestMethod = this.request.method;
          if (this.request.method == 'POST') {
            if (this.request.headers['x-sand'] == 'cats') {
              doRegister(this.request, this.response);
            } else {
              // This header is to avoid abuse of a browser as a
              // cross-site request forgery tool.
              this.response.writeHead(403, {'Content-Type': 'text/plain'});
              this.response.end('No header, no response.');
            }
          }
        }
      });
    // code to run on server at startup
    });
  });
}

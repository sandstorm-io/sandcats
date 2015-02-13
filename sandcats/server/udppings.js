// This file contains all the code for the UDP-based client ping
// system.
//
// The protocol is as follows:
//
// - Someone using the Sandcats dyndns system will send us a UDP
//   packet containing their dyndns hostname.
//
// - We look at it, and:
//
// - If the hostname matches the IP on file, we do nothing.
//
// - If the hostname does not match, we send a reply containing just a
//   "!".
//
// - When the client receives a reply, they know that they should
//   update the IP address we have on file for them.
//
// This does mean we perform a MongoDB query for every UDP packet we
// receive on this port, so we may want to think about making sure the
// query is high-performance. A different thing we could do, if
// performance of MongoDB is bad, is to do a DNS lookup for the
// hostname instead. This would shunt the performance penalty to
// PowerDNS and its cache, and it can probably deal.
//
// Note that if there is no hostname associated with the packet we
// received, then we do reply. Arguably this leaves us open to sending
// UDP packets all over the world. I think this "attack" is not a big
// deal because:
//
// - There is no traffic amplification. We send one packet per packet
//   we receive. Plus, our packet has just one byte.
//
// - I believe that source address spoofing is tough on the 2015-era
//   Internet. I could be wrong about this!
//
// If the inbound UDP packet is corrupted, then we might cause people
// to send us an IP address update more often than is needed. I think
// that's OK.

var dgram = Meteor.npmRequire('dgram');
var server = null;

startListeningForUdpPings = function() {
  var EXCLAMATION_POINT = new Buffer("!");

  if (server) {
    console.log("You seem to have called startListeningForUdpPings() twice. Bailing out.");
    return;
  }
  server = dgram.createSocket('udp4');

  server.on('listening', function() {
    var myAddress = server.address();
    console.log('Started listening for UDP pings on ' + myAddress.address + ":" + myAddress.port);

  });

  var onMessage = Meteor.bindEnvironment(function(err, result) {
    var message = result.message.asciiSlice();
    var remote = result.remote;

    var remoteIp = remote.address;

    // By default, we should reply to any message. Only if the IP
    // address and the hostname match should we not reply.
    var weShouldReply = ! UserRegistrations.findOne({
      ipAddress: remoteIp,
      hostname: message});

    if (weShouldReply) {
      server.send(EXCLAMATION_POINT, 0, 1, remote.port, remote.address);
    }
  });

  server.on('message', function(message, remote) {
    // wrapAsync() assumes (err, result) semantics, so we provide null
    // as the err and pass the data packaged together in one result
    // blob.
    onMessage(null, {message: message, remote: remote});
  });

  server.bind(Meteor.settings.UDP_PING_PORT, '0.0.0.0');
  console.log("Binding to port...");
};

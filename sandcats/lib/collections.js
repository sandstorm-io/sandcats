UserRegistrations = new Mongo.Collection("userRegistrations");
UserRegistrations.attachSchema(new SimpleSchema({
  hostname: {
    type: String,
    max: 20,
    min: 1
  },
  ipAddress: {
    // We use a String here for convenience. We rely on Mesosphere to
    // validate that this is actually an IP address.
    //
    // Note that we currently only support IPv4.
    type: String,
    max: 15,
    min: 1
    // FIXME: Somewhere we might want to make sure this is not a
    // "private IP"? Or not. Maybe we don't care.
  },
  fullPublicKeyPem: {
    // We rely on Mesosphere to validate that this is actually a
    // public key in PEM format.
    type: String
  },
  publicKeyId: {
    type: String,
    min: 40,
    max: 40
  },
  emailAddress: {
    // We use a string here for convenience. We rely on Mesosphere to
    // validate that this is actually an email address.
    type: String
  }
}));

// Compound data type used within UserRegistrations.
var recoveryTokenSchema = new SimpleSchema({
  recoveryToken: {
    type: String,
    min: 40,
    max: 40
  },
  timestamp: {
    // Rely in Javascript+Mongo+etc. to avoid timezone problems, since
    // in JS, date objects are timezone-aware by default.
    type: Date
  }
});

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
  publicKeyId: {
    type: String,
    min: 40,
    max: 40
  },
  emailAddress: {
    // We use a string here for convenience. We rely on Mesosphere to
    // validate that this is actually an email address.
    type: String
  },
  recoveryData: {
    // If there is an object here, then we allow the use of the
    // .recoveryData.recoveryToken as a string which can be used
    // to set the domain to a new public key.
    type: recoveryTokenSchema,
    optional: true
  }
}));

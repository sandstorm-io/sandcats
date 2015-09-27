// We use "hostname" in a few places in the schemas, so here we define
// what it means to be a hostname.
var hostnameType = {
  type: String,
  max: 20,
  min: 1
};

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
  hostname: hostnameType,
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

CertificateRequests = new Mongo.Collection("certificateRequests");
CertificateRequests.attachSchema(new SimpleSchema({
  requestCreationDate: {
    type: Date
  },
  devOrProd: {
    type: String,
    allowedValues: ["dev", "prod"]
  },
  hostname: hostnameType,
  intendedUseDurationDays: {
    type: Number
  },
  globalsignValidityPeriod: {
    type: Object
  },
  globalsignErrorMessages: {
    type: [String],
    optional: true
  },
  "globalsignValidityPeriod.Months": {
    type: Number
  },
  "globalsignValidityPeriod.NotBefore": {
    type: String,
    optional: true
  },
  "globalsignValidityPeriod.NotAfter": {
    type: String
  },
  globalsignCertificateInfo: {
    type: Object,
    optional: true
  },
  "globalsignCertificateInfo.CertificateStatus": {
    type: Number
  },
  "globalsignCertificateInfo.StartDate": {
    type: String
  },
  "globalsignCertificateInfo.EndDate": {
    type: String
  },
  "globalsignCertificateInfo.CommonName": {
    type: String
  },
  "globalsignCertificateInfo.SerialNumber": {
    type: String
  },
  "globalsignCertificateInfo.SubjectName": {
    type: String
  },
  "globalsignCertificateInfo.DNSNames": {
    type: String
  },
  receivedCertificateDate: {
    type: Date,
    optional: true
  }
}));

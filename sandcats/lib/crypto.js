// Utility functions relating to PEM-format public keys.

var forge = Meteor.npmRequire('node-forge');
publicKeyToFingerprint = function(publicKey) {
  console.log("AIEEEEE");
  console.log(publicKey);
  return forge.pki.getPublicKeyFingerprint(
    publicKey,
    {encoding: 'hex'});
}

pemToPublicKeyOrFalse = function(pemBytes) {
  try {
    var publicKey = forge.pki.publicKeyFromPem(pemBytes);
    if (publicKey) {
      return publicKey;
    }
  }
  catch (err) {
    console.log("While validating PEM public key, triggered error: " + err);
  }
  return false;
};

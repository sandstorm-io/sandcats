// Utility functions relating to PEM-format public keys.

var forge = Meteor.npmRequire('node-forge');
publicKeyToFingerprint = function(publicKey) {
  return forge.pki.getPublicKeyFingerprint(
    publicKey,
    {encoding: 'hex'});
}

pemToPublicKeyOrFalse = function(pemBytes) {
  try {
    var dummyKeyObject = forge.pki.publicKeyFromPem(pemBytes);
    if (dummyKeyObject) {
      return true;
    }
  }
  catch (err) {
    console.log("While validating PEM public key, triggered error: " + err);
  }
  return false;
};

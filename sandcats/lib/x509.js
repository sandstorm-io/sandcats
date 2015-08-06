// Code that deals with parsing data out of certificates lives here.
var pem = Meteor.npmRequire('pem');
var readCertificateInfo = Meteor.wrapAsync(pem.readCertificateInfo);

getCommonNameFromCsr = function(csrData) {
  // readCertificateInfo() can crash if csrData is empty, so
  // we work around that here.
  if (!csrData) {
    return "";
  }

  try {
    return readCertificateInfo(csrData).commonName || "";
  } catch (error) {
    console.error(error);
    return "";
  }
};

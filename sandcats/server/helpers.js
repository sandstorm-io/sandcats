getFormDataFromRequest = function(request) {
  // The form data is the request body, plus some extra data that we
  // add as if the user submitted it, for convenience of our own
  // processing.
  var rawFormData = _.clone(request.body);

  var clientIp = getClientIpFromRequest(request);
  rawFormData.ipAddress = clientIp;

  // For easy consistency, and to avoid wasting space, turn
  // e.g. "ab:cd" into "abcd".
  var clientCertificateFingerprint = request.headers['x-client-certificate-fingerprint'] || "";
  rawFormData.pubkey = clientCertificateFingerprint.replace(/:/g, "");

  return rawFormData;
}

// Code that deals with parsing data out of certificates lives here.
var merge = Meteor.npmRequire("node.extend");
var common = Meteor.npmRequire("asn1js/org/pkijs/common.js");
var _asn1js = Meteor.npmRequire("asn1js");
var _pkijs = Meteor.npmRequire("pkijs");
var _x509schema = Meteor.npmRequire("pkijs/org/pkijs/x509_schema.js");

// #region Merging function/object declarations for ASN1js and PKIjs
var asn1js = merge(true, _asn1js, common);

var x509schema = merge(true, _x509schema, asn1js);

var pkijs_1 = merge(true, _pkijs, asn1js);
var pkijs = merge(true, pkijs_1, x509schema);

getCommonNameFromCsr = function(csrData) {
  var csrData = csrData.replace(/(-----(BEGIN|END) CERTIFICATE REQUEST-----|\n)/g, '');
  var nodeBuffer = new Buffer(csrData, 'base64');
  var arrayBuffer = new Uint8Array(nodeBuffer).buffer;
  var asn1 = pkijs.org.pkijs.fromBER(arrayBuffer);
  var pkcs10_simpl = new pkijs.org.pkijs.simpl.PKCS10({ schema: asn1.result });
  // Now, find the commonName section. The type identifier for commonName
  // is 2.5.4.3.
  if (pkcs10_simpl && pkcs10_simpl.subject && pkcs10_simpl.subject.types_and_values) {
    var subject_data = pkcs10_simpl.subject.types_and_values;
    for (var i = 0 ; i < subject_data.length; i++) {
      var subject_datum = subject_data[i];
      if (subject_datum.type == '2.5.4.3') {
        return subject_datum.value.value_block.value;
      }
    }
  }

  // Otherwise, return a blank commonName.
  return "";
}

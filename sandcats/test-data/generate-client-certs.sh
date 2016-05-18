#!/bin/bash
#
# I wrote this script because, a year later, these certs expired, and I forgot how I generated
# them in the first place.
NUM_CERTS=5

function generate_one_cert() {
  local cert_number="$1"
  local keyfile="client-cert-${cert_number}.key"
  local crtfile="client-cert-${cert_number}.crt"
  openssl req -new -subj '/C=AU/ST=Some-State/O=Internet Widgits Pty Ltd' -newkey rsa:2048 -days 365 -nodes -x509 -keyout "$keyfile"  -out "$crtfile"
}

for i in $(seq $NUM_CERTS); do
  generate_one_cert "$i"
done

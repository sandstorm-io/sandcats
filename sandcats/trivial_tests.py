import requests

def register_asheesh():
    return requests.post(
        'http://localhost:3000/register',
        {'rawHostname': 'asheesh',
         'email': 'asheesh@asheesh.org',
         'pubkey': open('snakeoil-sample-certs/ssl-cert-snakeoil.pubkey').read()},
        )

def register_asheesh2_bad_key_type():
    return requests.post(
        'http://localhost:3000/register',
        {'rawHostname': 'asheesh2',
         'email': 'asheesh@asheesh.org',
         'pubkey': open('snakeoil-sample-certs/ssl-cert-snakeoil.pem').read()},
        )

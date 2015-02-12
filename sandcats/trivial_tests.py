import requests

def register_asheesh():
    return requests.post(
        'http://localhost:3000/register',
        {'rawHostname': 'asheesh',
         'email': 'asheesh@asheesh.org',
         'pubkey': open('snakeoil-sample-certs/ssl-cert-snakeoil.pubkey').read()},
        )

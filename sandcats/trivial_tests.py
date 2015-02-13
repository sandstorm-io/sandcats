import requests

def register_asheesh():
    return requests.post(
        'http://localhost:3000/register',
        data={
            'rawHostname': 'asheesh',
            'email': 'asheesh@asheesh.org',
            'pubkey': open('snakeoil-sample-certs/ssl-cert-snakeoil.pubkey').read(),
        },
        headers={
            'X-Sand': 'cats',
        },
    )

def register_asheesh2_bad_key_type():
    return requests.post(
        'http://localhost:3000/register',
        data={
            'rawHostname': 'asheesh2',
            'email': 'asheesh@asheesh.org',
            'pubkey': open('snakeoil-sample-certs/ssl-cert-snakeoil.pem').read(),
        },
        headers={'X-Sand': 'cats'},
    )

def register_asheesh3_x_forwarded_for():
    # Provide the HTTP_FORWARDED_COUNT=1 environment variable to
    # Meteor before running this test.
    #
    # FIXME: This doesn't pass, but for now, I'm not *that* worried.
    return requests.post(
        'http://localhost:3000/register',
        data={'rawHostname': 'asheesh3',
         'email': 'asheesh@asheesh.org',
         'pubkey': open('snakeoil-sample-certs/ssl-cert-snakeoil.pubkey').read()},
        headers={
            'X-Forwarded-For': '128.151.2.1',
            'X-Sand': 'cats',
        },
    )

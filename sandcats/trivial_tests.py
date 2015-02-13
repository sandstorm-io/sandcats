import requests

def register_asheesh():
    return requests.post(
        'http://localhost:3000/register',
        data={
            'rawHostname': 'asheesh',
            'email': 'asheesh@asheesh.org',
        },
        headers={
            'X-Sand': 'cats',
            'X-Client-Certificate-Fingerprint': '10:16:48:8E:4C:1F:88:3A:AE:99:38:26:4C:93:E0:3E:9F:B7:74:13',
        },
    )

def register_asheesh2_missing_fingerprint():
    return requests.post(
        'http://localhost:3000/register',
        data={
            'rawHostname': 'asheesh2',
            'email': 'asheesh@asheesh.org',
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
            'X-Client-Certificate-Fingerprint': 'nonsense',
        },
    )

def update_asheesh_good():
    # Provide the HTTP_FORWARDED_COUNT=1 environment variable to
    # Meteor before running this test.
    #
    # FIXME: This doesn't pass, but for now, I'm not *that* worried.
    return requests.post(
        'http://localhost:3000/update',
        data={'rawHostname': 'asheesh',
              'email': 'asheesh@asheesh.org',
        },
        headers={
            'X-Forwarded-For': '128.151.2.1',
            'X-Sand': 'cats',
            'X-Client-Certificate-Fingerprint': '10:16:48:8E:4C:1F:88:3A:AE:99:38:26:4C:93:E0:3E:9F:B7:74:13',
        },
    )

def update_asheesh_caps_basically_good():
    return requests.post(
        'http://localhost:3000/update',
        data={'rawHostname': 'ASHEESH',
              'email': 'asheesh@asheesh.org',
        },
        headers={
            'X-Forwarded-For': '128.151.2.1',
            'X-Sand': 'cats',
            'X-Client-Certificate-Fingerprint': '10:16:48:8E:4C:1F:88:3A:AE:99:38:26:4C:93:E0:3E:9F:B7:74:13',
        },
    )

def update_asheesh3_unauthorized():
    return requests.post(
        'http://localhost:3000/update',
        data={'rawHostname': 'asheesh3',
              'email': 'asheesh@asheesh.org',
        },
        headers={
            'X-Forwarded-For': '128.151.2.1',
            'X-Sand': 'cats',
            'X-Client-Certificate-Fingerprint': '10:16:48:8E:4C:1F:88:3A:AE:99:38:26:4C:93:E0:3E:9F:B7:74:13',
        },
    )

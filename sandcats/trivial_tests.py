import requests
import os


import logging
import httplib
httplib.HTTPConnection.debuglevel = 1

logging.basicConfig() # you need to initialize logging, otherwise you will not see anything from requests
logging.getLogger().setLevel(logging.DEBUG)
requests_log = logging.getLogger("requests.packages.urllib3")
requests_log.setLevel(logging.DEBUG)
requests_log.propagate = True


def make_url(path):
    BASE_URL = os.environ.get('BASE_URL', 'http://localhost:3000/')
    assert BASE_URL.endswith('/')
    return BASE_URL + path


def add_key(n, requests_kwargs):
    '''This is a helper for testing different client certificates to use
    for authentication.

    n is one of: None, 1, 2, 3.

    requests_kwargs is the keyword-arguments we were going to pass to
    the requests library. This function mutates the kwargs as needed.

    If BASE_URL starts with 'https', then we use the client
    certificates within the test-data/ directory. Else we use one of 3
    hard-coded fingerprints.

    '''
    if make_url('').startswith('https'):
        return _add_real_client_cert(n, requests_kwargs)

    if n is None:
        return

    HARDCODED_FINGERPRINTS = {}
    HARDCODED_FINGERPRINTS[1] = '01:16:48:8E:4C:1F:88:3A:AE:99:38:26:4C:93:E0:3E:9F:B7:74:13'
    HARDCODED_FINGERPRINTS[2] = '02:16:48:8E:4C:1F:88:3A:AE:99:38:26:4C:93:E0:3E:9F:B7:74:13'
    HARDCODED_FINGERPRINTS[3] = '03:16:48:8E:4C:1F:88:3A:AE:99:38:26:4C:93:E0:3E:9F:B7:74:13'
    requests_kwargs['headers']['X-Client-Certificate-Fingerprint'] = HARDCODED_FINGERPRINTS[n]

def _add_real_client_cert(n, requests_kwargs):
    '''See add_key() docs.'''
    print 'yay'
    requests_kwargs['verify'] = False  # Sad but useful for local testing.
    requests_kwargs['cert'] = ('test-data/output', 'test-data/output')
    #client-cert-%d.crt' % (n,),
    #                           'test-data/client-cert-%d.key' % (n,))

def register_asheesh():
    requests_kwargs = dict(
        url=make_url('register'),
        data={
            'rawHostname': 'asheesh',
            'email': 'asheesh@asheesh.org',
        },
        headers={
            'X-Sand': 'cats',
        },
    )
    add_key(1, requests_kwargs)
    return requests.post(**requests_kwargs)

def register_asheesh2_missing_fingerprint():
    requests_kwargs = dict(
        url=make_url('register'),
        data={
            'rawHostname': 'asheesh2',
            'email': 'asheesh@asheesh.org',
        },
        headers={'X-Sand': 'cats'},
    )
    add_key(None, requests_kwargs)
    return requests.post(**requests_kwargs)

def register_asheesh3_x_forwarded_for():
    # Provide the HTTP_FORWARDED_COUNT=1 environment variable to
    # Meteor before running this test.
    #
    # FIXME: This doesn't pass, but for now, I'm not *that* worried.
    requests_kwargs = dict(
        url=make_url('register'),
        data={'rawHostname': 'asheesh3',
         'email': 'asheesh@asheesh.org',
         'pubkey': open('snakeoil-sample-certs/ssl-cert-snakeoil.pubkey').read()},
        headers={
            'X-Forwarded-For': '128.151.2.1',
        },
    )
    add_key(None, requests_kwargs)
    return requests.post(**requests_kwargs)


def update_asheesh_good():
    # Provide the HTTP_FORWARDED_COUNT=1 environment variable to
    # Meteor before running this test.
    #
    # FIXME: This doesn't pass, but for now, I'm not *that* worried.
    requests_kwargs = dict(
        url=make_url('update'),
        data={'rawHostname': 'asheesh',
              'email': 'asheesh@asheesh.org',
        },
        headers={
            'X-Sand': 'cats',
        },
    )
    add_key(1, requests_kwargs)
    return requests.post(**requests_kwargs)

def update_asheesh_caps_basically_good():
    requests_kwargs = dict(
        url=make_url('update'),
        data={'rawHostname': 'ASHEESH',
              'email': 'asheesh@asheesh.org',
        },
        headers={
            'X-Forwarded-For': '128.151.2.1',
            'X-Sand': 'cats',
        },
    )
    add_key(1, requests_kwargs)
    return requests.post(**requests_kwargs)

def update_asheesh3_unauthorized():
    requests_kwargs = dict(
        url=make_url('update'),
        data={'rawHostname': 'asheesh3',
              'email': 'asheesh@asheesh.org',
        },
        headers={
            'X-Forwarded-For': '128.151.2.1',
            'X-Sand': 'cats',
        },
    )
    add_key(3, requests_kwargs)
    return requests.post(**requests_kwargs)

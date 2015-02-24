import requests
import os
import dns.resolver
import StringIO
import time


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
    requests_kwargs['verify'] = False  # Sad but useful for local testing.
    if n is None:
        return
    requests_kwargs['cert'] = ('test-data/client-cert-%d.crt' % (n,),
                               'test-data/client-cert-%d.key' % (n,))

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

def register_asheesh2_missing_sand_cats_header():
    requests_kwargs = dict(
        url=make_url('register'),
        data={
            'rawHostname': 'asheesh2',
            'email': 'asheesh@asheesh.org',
        },
    )
    add_key(2, requests_kwargs)
    return requests.post(**requests_kwargs)


def register_asheesh3_x_forwarded_for():
    # Provide the HTTP_FORWARDED_COUNT=1 environment variable to
    # Meteor before running this test.
    #
    # FIXME: This doesn't pass, but for now, I'm not *that* worried.
    requests_kwargs = dict(
        url=make_url('register'),
        data={
            'rawHostname': 'asheesh3',
            'email': 'asheesh@asheesh.org',
        },
        headers={
            'X-Sand': 'cats',
            'X-Forwarded-For': '128.151.2.1',
        },
    )
    add_key(3, requests_kwargs)
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

def get_resolver():
    resolver = dns.resolver.Resolver()
    resolver.reset()

    # Configure our test resolver to resolve against localhost
    resolver.read_resolv_conf(StringIO.StringIO('nameserver 127.0.0.1'))

    return resolver

def reset_app_state():
    # To reset the Sandcats app, we must:
    # - Clear out Mongo, and
    # - Remove the PowerDNS database, and
    # - Restart the sandcats service, if it is enabled.
    os.system('''echo 'drop database if exists sandcats_pdns;' | mysql -uroot''')
    os.system('''cd .. ; make stage-mysql-setup''')
    os.system('''printf '\n\nUserRegistrations.remove({}); \n\n .exit \n ' | script  -c 'meteor shell' /dev/stdin''')
    os.system('sudo service sandcats restart')
    time.sleep(1)  # Make sure the restart gets a chance to start, to avoid HTTP 502.
    os.system('sudo service nginx restart')
    # Attempt to get the homepage, which will mean that Meteor is back, waiting at most 10 seconds.
    requests.get('http://localhost/', timeout=10)


def main():
    # This main function runs our various manual test helpers, and
    # checks that their return value is what we were hoping for.
    #
    # It assumes that when it started, the system is properly set up but
    # empty.
    resolver = get_resolver()

    # Register asheesh dot our domain
    response = register_asheesh()
    assert response.status_code == 200, response.content

    # Assume for now that the Meteor code has updated MongoDB.

    # Make sure DNS is updated.
    dns_response = resolver.query('asheesh.sandcatz.io', 'A')
    assert str(dns_response.rrset) == 'asheesh.sandcatz.io. 60 IN A 127.0.0.1'

    dns_response = resolver.query('subdomain-test.asheesh.sandcatz.io', 'A')
    assert str(dns_response.rrset) == 'subdomain-test.asheesh.sandcatz.io. 60 IN A 127.0.0.1'

    # Attempt to register a domain with no client certificate; get rejected.
    response = register_asheesh2_missing_fingerprint()
    assert response.status_code == 400, response.content
    parsed_content = response.json()
    assert (
        parsed_content['error_text'] ==
        'Your client is misconfigured. You need to provide a client certificate.')

    # Attempt to do a POST without the X-Sand: cats header; refuse to
    # process the request.  This is an anti-cross-site-request forgery
    # tactic, since browsers won't easily be tricked into sending a
    # request with this header.
    response = register_asheesh2_missing_sand_cats_header()
    assert response.status_code == 403, response.content
    parsed_content = response.json()
    assert (
        parsed_content['error_text'] ==
        'Your client is misconfigured. You need X-Sand: cats')

    # Attempt to register a domain by providing an X-Forwarded-For
    # header that is set to a forged source address. The registration
    # will succeed; make sure it is for 127.0.0.1, not for
    # 128.151.2.1.
    response = register_asheesh3_x_forwarded_for()
    assert response.status_code == 200, response.content

    dns_response = resolver.query('asheesh3.sandcatz.io', 'A')
    assert str(dns_response.rrset) == 'asheesh3.sandcatz.io. 60 IN A 127.0.0.1'




if __name__ == '__main__':
    main()

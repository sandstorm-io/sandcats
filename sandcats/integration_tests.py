import requests
import netifaces
import os
import dns.resolver
import StringIO
import time
import socket


import logging
import httplib

if 'DEBUG' in os.environ:
    httplib.HTTPConnection.debuglevel = 1
    logging.basicConfig() # you need to initialize logging, otherwise you will not see anything from requests
    logging.getLogger().setLevel(logging.DEBUG)
    requests_log = logging.getLogger("requests.packages.urllib3")
    requests_log.setLevel(logging.DEBUG)
    requests_log.propagate = True

interface_cache = {}


def make_url(path, external_ip=False):
    BASE_URL = ''

    global interface_cache
    if not interface_cache:
        for ifacename in netifaces.interfaces():
            try:
                address = netifaces.ifaddresses(ifacename)[
                    netifaces.AF_INET][0]['addr']
            except:
                # This interface has no IPv4 address.
                continue
            interface_cache[ifacename] = address

    if external_ip:
        # Find an interface not called lo. If there is no such interface, crash.
        externals = [x for x in interface_cache.keys() if x != 'lo']
        assert externals
        external = externals[0]

        BASE_URL = 'https://' + interface_cache[external] + ':443/'
    else:
        # Otherwise, we assume localhost and 127.0.0.1 and lo are all the same.
        BASE_URL = 'https://127.0.0.1:443/'

    # Make sure it got filled in, and has sane structure.
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


def register_asheesh1_with_asheesh2_key():
    requests_kwargs = dict(
        url=make_url('register', external_ip=True),
        data={'rawHostname': 'asheesh',
              'email': 'asheesh@asheesh.org',
        },
        headers={
            'Accept': 'text/plain',
            'X-Sand': 'cats',
        },
    )
    add_key(2, requests_kwargs)
    return requests.post(**requests_kwargs)

def register_asheesh2_successfully_text_plain():
    requests_kwargs = dict(
        url=make_url('register'),
        data={
            'rawHostname': 'asheesh2',
            'email': 'asheesh@asheesh.org',
        },
        headers={'X-Sand': 'cats',
                 'Accept': 'text/plain',
        },
    )
    add_key(2, requests_kwargs)
    return requests.post(**requests_kwargs)


def register_asheesh2_wrong_http_method():
    requests_kwargs = dict(
        url=make_url('register'),
        data={
            'rawHostname': 'asheesh2',
            'email': 'asheesh@asheesh.org',
        },
        headers={'X-Sand': 'cats'},
    )
    add_key(2, requests_kwargs)
    return requests.get(**requests_kwargs)


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
            'X-Real-IP': '128.151.2.1',
        },
    )
    add_key(3, requests_kwargs)
    return requests.post(**requests_kwargs)


def update_asheesh_good():
    requests_kwargs = dict(
        url=make_url('update', external_ip=True),
        data={'rawHostname': 'asheesh',
        },
        headers={
            'X-Sand': 'cats',
        },
    )
    add_key(1, requests_kwargs)
    return requests.post(**requests_kwargs)


def update_asheesh2_with_asheesh1_key():
    requests_kwargs = dict(
        url=make_url('update', external_ip=True),
        data={'rawHostname': 'asheesh2',
        },
        headers={
            'X-Sand': 'cats',
        },
    )
    add_key(1, requests_kwargs)
    return requests.post(**requests_kwargs)


def update_asheesh2_caps_basically_good():
    requests_kwargs = dict(
        url=make_url('update', external_ip=True),
        data={'rawHostname': 'ASHEESH2',
              'email': 'asheesh@asheesh.org',
        },
        headers={
            'X-Forwarded-For': '128.151.2.1',
            'X-Real-IP': '128.151.2.1',
            'X-Sand': 'cats',
        },
    )
    add_key(2, requests_kwargs)
    return requests.post(**requests_kwargs)


def update_asheesh3_unauthorized():
    requests_kwargs = dict(
        url=make_url('update'),
        data={'rawHostname': 'asheesh3',
              'email': 'asheesh@asheesh.org',
        },
        headers={
            'X-Forwarded-For': '128.151.2.1',
            'X-Real-IP': '128.151.2.1',
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
    os.system('''printf '\n\ndb.userRegistrations.remove({}); \n\nexit \n ' | mongo sandcats_mongo''')
    os.system('sudo service sandcats restart')
    os.system('sudo service pdns restart')
    time.sleep(1)  # Make sure the restart gets a chance to start, to avoid HTTP 502.
    os.system('sudo service nginx restart')
    # Attempt to get the homepage, which will mean that Meteor is back, waiting at most 10 seconds.
    requests.get('http://localhost/', timeout=10)


def wait_for_new_resolve_value(resolver, domain, rr_type, old_value):
    SECONDS_TO_WAIT = 20

    for i in range(SECONDS_TO_WAIT + 1):
        dns_response = resolver.query(domain, rr_type)
        # Yay, it didn't crash, so there is a response!
        if str(dns_response.rrset) == old_value:
            print '.',
            time.sleep(1)

    # Do one last query, and verify that it has some different value.
    dns_response = resolver.query(domain, rr_type)
    assert str(dns_response.rrset) != old_value, old_value


def wait_for_nxdomain_cache_to_clear(resolver, domain, rr_type):
    SECONDS_TO_WAIT = 20

    for i in range(SECONDS_TO_WAIT + 1):
        try:
            resolver.query(domain, rr_type)
            # If we get this far, hooray, we are done waiting.
            return
        except dns.resolver.NXDOMAIN:
            # Wait a sec, and let's retry.
            print '.',
            time.sleep(1)

    raise RuntimeError, "We waited a while but the NXDOMAIN did not go away."


def assert_nxdomain(resolver, domain, rr_type):
    got_nxdomain = False
    try:
        resolver.query(domain, rr_type)
    except dns.resolver.NXDOMAIN:
        got_nxdomain = True

    assert got_nxdomain


def test_register():
    # This function runs our various manual test helpers, and checks
    # that their return value is what we were hoping for.
    #
    # It assumes that when it started, the system is properly set up but
    # empty.
    resolver = get_resolver()

    # NOTE: test_register() and friends use the default
    # make_url(external_ip=False) behavior of submitting data over
    # HTTPS to nginx on 127.0.0.1. Therefore, the resulting data it
    # finds in DNS will always be 127.0.0.1
    #
    # test_update() sometimes uses make_url(external_ip=True), as a
    # way to have a different IP address show up to nginx, and
    # therefore for the update event to be meaningful.

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
        parsed_content['text'] ==
        'Your client is misconfigured. You need to provide a client certificate.')
    assert_nxdomain(resolver, 'asheesh2.sandcatz.io', 'A')

    # Attempt to do a GET to /register. Get rejected since /register always
    # wants a POST.
    response = register_asheesh2_wrong_http_method()
    assert response.status_code == 403, response.content
    parsed_content = response.json()
    assert (
        parsed_content['text'] ==
        'Must POST.')
    assert_nxdomain(resolver, 'asheesh2.sandcatz.io', 'A')

    # Attempt to do a POST without the X-Sand: cats header; refuse to
    # process the request.  This is an anti-cross-site-request forgery
    # tactic, since browsers won't easily be tricked into sending a
    # request with this header.
    response = register_asheesh2_missing_sand_cats_header()
    assert response.status_code == 403, response.content
    parsed_content = response.json()
    assert (
        parsed_content['text'] ==
        'Your client is misconfigured. You need X-Sand: cats')
    assert_nxdomain(resolver, 'asheesh2.sandcatz.io', 'A')

    # Attempt to register a domain by providing an X-Forwarded-For
    # header that is set to a forged source address. The registration
    # will succeed; make sure it is for 127.0.0.1, not for
    # 128.151.2.1.
    response = register_asheesh3_x_forwarded_for()
    assert response.status_code == 200, response.content

    dns_response = resolver.query('asheesh3.sandcatz.io', 'A')
    assert str(dns_response.rrset) == 'asheesh3.sandcatz.io. 60 IN A 127.0.0.1'

    # Using the asheesh2 key, attempt to steal asheesh's DNS domain.
    response = register_asheesh1_with_asheesh2_key()
    assert response.status_code == 400
    assert response.content == 'This hostname is already in use. Try a new name.'

    # Finally, register asheesh2 successfully.
    response = register_asheesh2_successfully_text_plain()
    assert response.status_code == 200, response.content
    assert response.headers['Content-Type'] == 'text/plain'
    assert response.content == 'Successfully registered!'
    wait_for_nxdomain_cache_to_clear(resolver, 'asheesh2.sandcatz.io', 'A')
    dns_response = resolver.query('asheesh2.sandcatz.io', 'A')
    assert str(dns_response.rrset) == 'asheesh2.sandcatz.io. 60 IN A 127.0.0.1'

def test_update():
    # The update helpers should use make_url(external_ip=True); see
    # remark in test_register() for more information.

    # Get a resolver that will query 127.0.0.1.
    resolver = get_resolver()

    # Update the "asheesh" subdomain.
    response = update_asheesh_good()
    assert response.status_code == 200, response.content
    # Make sure DNS is updated.
    wait_for_new_resolve_value(resolver,
                               'asheesh.sandcatz.io',
                               'A',
                               'asheesh.sandcatz.io. 60 IN A 127.0.0.1')

    # Use key 1 to update "asheesh2", which should be rejected due to
    # being unauthorized.
    response = update_asheesh2_with_asheesh1_key()
    assert response.status_code == 403, response.content
    # FIXME: Make sure asheesh2 is still pointing at localhost. I
    # guess we need to wait for 20 seconds, which is pretty sad.

    # Test that we can do an update of asheesh2 even though for some
    # reason the client is giving us the rawHostname as all caps.
    response = update_asheesh2_caps_basically_good()
    assert response.status_code == 200, response.content
    # Make sure DNS is updated.
    wait_for_new_resolve_value(resolver,
                               'asheesh2.sandcatz.io',
                               'A',
                               'asheesh2.sandcatz.io. 60 IN A 127.0.0.1')

    # Test that, via the UDP protocol, the server would be surprised
    # by a UDP packet on 127.0.0.1 for the "asheesh" hostname, since
    # it has been moved to the other IP address.
    #
    # To do that, we create a simple Python UDP client that makes a socket
    # to 127.0.0.1, sends a message to the sandcats daemon, and
    # checks that it gets a response within one second.
    UDP_DEST_IP = '127.0.0.1'
    UDP_DEST_PORT = 8080
    message = 'asheesh 0123456789abcdef'
    try:
        client = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        client.sendto(message, (UDP_DEST_IP, UDP_DEST_PORT))
        client.settimeout(1)
        data = client.recv(1024)
        assert data == '0123456789abcdef'
    except socket.timeout:
        assert False, "Hit timeout without a reply. How sad."
        client.close()

    # Now, make sure that asheesh3 would not be surprised by messages
    # from localhost.
    message = 'asheesh3 0123456789abcdef'
    try:
        client = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        client.sendto(message, (UDP_DEST_IP, UDP_DEST_PORT))
        client.settimeout(1)
        client.recv(1024)
        assert False, "We were hoping for no response."
    except socket.timeout:
        # Hooray! No response.
        print "."
    finally:
        client.close()


if __name__ == '__main__':
    test_register()
    test_update()

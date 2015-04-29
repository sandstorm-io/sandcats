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

def _make_api_call(rawHostname, key_number, path='register',
                   provide_x_sandcats=True, external_ip=False,
                   http_method='post', accept_mime_type=None,
                   email='benb@benb.org',
                   x_forwarded_for=None):
    '''This internal helper function allows code-reuse within the tests.'''
    submitted_form_data = {}
    if rawHostname is not None:
        submitted_form_data['rawHostname'] = rawHostname

    if email is not None:
        submitted_form_data['email'] = email

    url = make_url(path, external_ip=external_ip)

    headers = {}
    if provide_x_sandcats:
        headers['X-Sand'] = 'cats'

    if accept_mime_type:
        headers['Accept'] = accept_mime_type

    if x_forwarded_for:
        headers['X-Forwarded-For'] = x_forwarded_for
        headers['X-Real-IP'] = x_forwarded_for

    requests_kwargs = dict(
        url=url,
        data=submitted_form_data,
        headers=headers,
    )

    add_key(key_number, requests_kwargs)

    if http_method in ('get', 'post'):
        action = getattr(requests, http_method)

    return action(**requests_kwargs)

def register_benb():
    return _make_api_call(
        rawHostname='benb',
        provide_x_sandcats=True,
        key_number=1)


def register_benb2_missing_fingerprint():
    return _make_api_call(
        rawHostname='benb2',
        provide_x_sandcats=True,
        key_number=None)


def register_benb1_with_benb2_key():
    return _make_api_call(
        external_ip=True,
        rawHostname='benb',
        accept_mime_type='text/plain',
        key_number=2)


def register_ftp_with_benb2_key():
    return _make_api_call(
        external_ip=True,
        rawHostname='ftp',
        key_number=2)


def register_benb2_successfully_text_plain():
    return _make_api_call(
        rawHostname='benb2',
        accept_mime_type='text/plain',
        key_number=2)


def register_benb2_reuse_benb_key():
    return _make_api_call(
        rawHostname='benb2',
        key_number=1)


def register_benb2_invalid_email():
    return _make_api_call(
        rawHostname='benb2',
        email='benb@benb',
        key_number=2)


def register_benb2_wrong_http_method():
    return _make_api_call(
        rawHostname='benb2',
        http_method='get',
        key_number=2)


def register_benb2_missing_sand_cats_header():
    return _make_api_call(
        rawHostname='benb2',
        key_number=2,
        provide_x_sandcats=False)


def register_benb3_x_forwarded_for():
    # Provide the HTTP_FORWARDED_COUNT=1 environment variable to
    # Meteor before running this test.
    #
    # FIXME: This doesn't pass, but for now, I'm not *that* worried.
    return _make_api_call(
        rawHostname='benb3',
        key_number=3,
        x_forwarded_for='128.151.2.1')


def update_benb_good():
    return _make_api_call(
        path='update',
        external_ip=True,
        rawHostname='benb',
        key_number=1)


def update_benb2_with_benb1_key():
    return _make_api_call(
        path='update',
        external_ip=True,
        rawHostname='benb2',
        key_number=1)


def update_benb2_caps_basically_good():
    return _make_api_call(
        path='update',
        external_ip=True,
        rawHostname='BENB2',
        x_forwarded_for='128.151.2.1',
        key_number=2)


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

    # Make sure we have some kind of SOA; store it.
    dns_response = resolver.query('sandcatz.io', 'SOA')
    initial_soa = str(dns_response.rrset)
    assert initial_soa, "Hmm, the server gave us no SOA at all."

    # Register benb dot our domain
    response = register_benb()
    assert response.status_code == 200, response.content
    # Assume for now that the Meteor code has updated MongoDB.

    # Make sure the SOA increased.
    wait_for_new_resolve_value(resolver,
                               'sandcatz.io',
                               'SOA',
                               initial_soa)
    dns_response = resolver.query('sandcatz.io', 'SOA')
    next_soa = str(dns_response.rrset)
    assert next_soa != initial_soa, next_soa

    # Make sure DNS is updated.
    dns_response = resolver.query('benb.sandcatz.io', 'A')
    assert str(dns_response.rrset) == 'benb.sandcatz.io. 60 IN A 127.0.0.1'

    dns_response = resolver.query('subdomain-test.benb.sandcatz.io', 'A')
    assert str(dns_response.rrset) == 'subdomain-test.benb.sandcatz.io. 60 IN A 127.0.0.1'

    # Attempt to register a domain with no client certificate; get rejected.
    response = register_benb2_missing_fingerprint()
    assert response.status_code == 400, response.content
    parsed_content = response.json()
    assert (
        parsed_content['text'] ==
        'Your client is misconfigured. You need to provide a client certificate.')
    assert_nxdomain(resolver, 'benb2.sandcatz.io', 'A')

    # Attempt to register ftp as a domain. This should fail, and if it
    # does successfully fail, then we can be reasonably confident that
    # all the various disallowed names also fail.
    response = register_ftp_with_benb2_key()
    assert response.status_code == 400, response.content
    parsed_content = response.json()
    assert (
        parsed_content['text'] ==
        'This hostname is already in use. Try a new name.'
    )
    assert_nxdomain(resolver, 'ftp.sandcatz.io', 'A')

    # Attempt to register benb2 with a key that benb used.
    response = register_benb2_reuse_benb_key()
    assert response.status_code == 400, response.content
    parsed_content = response.json()
    assert (
        parsed_content['text'] ==
        'There is already a domain registered with this sandcats key. If you are re-installing, you can skip the Sandcats configuration process.'
    )
    assert_nxdomain(resolver, 'benb2.sandcatz.io', 'A')

    # Attempt to register benb2 with a bad email address.
    response = register_benb2_invalid_email()
    assert response.status_code == 400, response.content
    parsed_content = response.json()
    assert (
        parsed_content['text'] ==
        'Please enter a valid email address.'
    ), parsed_content['text']
    assert_nxdomain(resolver, 'benb2.sandcatz.io', 'A')

    # Attempt to do a GET to /register. Get rejected since /register always
    # wants a POST.
    response = register_benb2_wrong_http_method()
    assert response.status_code == 403, response.content
    parsed_content = response.json()
    assert (
        parsed_content['text'] ==
        'Must POST.')
    assert_nxdomain(resolver, 'benb2.sandcatz.io', 'A')

    # Attempt to do a POST without the X-Sand: cats header; refuse to
    # process the request.  This is an anti-cross-site-request forgery
    # tactic, since browsers won't easily be tricked into sending a
    # request with this header.
    response = register_benb2_missing_sand_cats_header()
    assert response.status_code == 403, response.content
    parsed_content = response.json()
    assert (
        parsed_content['text'] ==
        'Your client is misconfigured. You need X-Sand: cats')
    assert_nxdomain(resolver, 'benb2.sandcatz.io', 'A')

    # Attempt to register a domain by providing an X-Forwarded-For
    # header that is set to a forged source address. The registration
    # will succeed; make sure it is for 127.0.0.1, not for
    # 128.151.2.1.
    response = register_benb3_x_forwarded_for()
    assert response.status_code == 200, response.content

    dns_response = resolver.query('benb3.sandcatz.io', 'A')
    assert str(dns_response.rrset) == 'benb3.sandcatz.io. 60 IN A 127.0.0.1'

    # Using the benb2 key, attempt to steal benb's DNS domain.
    response = register_benb1_with_benb2_key()
    assert response.status_code == 400
    assert response.content == 'This hostname is already in use. Try a new name.'

    # Finally, register benb2 successfully.
    response = register_benb2_successfully_text_plain()
    assert response.status_code == 200, response.content
    assert response.headers['Content-Type'] == 'text/plain'
    assert response.content == 'Successfully registered!'
    wait_for_nxdomain_cache_to_clear(resolver, 'benb2.sandcatz.io', 'A')
    dns_response = resolver.query('benb2.sandcatz.io', 'A')
    assert str(dns_response.rrset) == 'benb2.sandcatz.io. 60 IN A 127.0.0.1'

def test_update():
    # The update helpers should use make_url(external_ip=True); see
    # remark in test_register() for more information.

    # Get a resolver that will query 127.0.0.1.
    resolver = get_resolver()

    # Update the "benb" subdomain.
    response = update_benb_good()
    assert response.status_code == 200, response.content
    # Make sure DNS is updated.
    wait_for_new_resolve_value(resolver,
                               'benb.sandcatz.io',
                               'A',
                               'benb.sandcatz.io. 60 IN A 127.0.0.1')

    # Use key 1 to update "benb2", which should be rejected due to
    # being unauthorized.
    response = update_benb2_with_benb1_key()
    assert response.status_code == 403, response.content
    # FIXME: Make sure benb2 is still pointing at localhost. I
    # guess we need to wait for 20 seconds, which is pretty sad.

    # Test that we can do an update of benb2 even though for some
    # reason the client is giving us the rawHostname as all caps.
    response = update_benb2_caps_basically_good()
    assert response.status_code == 200, response.content
    # Make sure DNS is updated.
    wait_for_new_resolve_value(resolver,
                               'benb2.sandcatz.io',
                               'A',
                               'benb2.sandcatz.io. 60 IN A 127.0.0.1')

    # Test that, via the UDP protocol, the server would be surprised
    # by a UDP packet on 127.0.0.1 for the "benb" hostname, since
    # it has been moved to the other IP address.
    #
    # To do that, we create a simple Python UDP client that makes a socket
    # to 127.0.0.1, sends a message to the sandcats daemon, and
    # checks that it gets a response within one second.
    UDP_DEST_IP = '127.0.0.1'
    UDP_DEST_PORT = 8080
    message = 'benb 0123456789abcdef'
    try:
        client = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        client.sendto(message, (UDP_DEST_IP, UDP_DEST_PORT))
        client.settimeout(1)
        data = client.recv(1024)
        assert data == '0123456789abcdef'
    except socket.timeout:
        assert False, "Hit timeout without a reply. How sad."
        client.close()

    # Now, make sure that benb3 would not be surprised by messages
    # from localhost.
    message = 'benb3 0123456789abcdef'
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

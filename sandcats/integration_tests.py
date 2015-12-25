import contextlib
import requests
import netifaces
import os
import dns.resolver
import StringIO
import time
import socket
import subprocess
import sys

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


# Now give the JS backend about 10 seconds to send the mail. Snag
# its output.
def get_recoveryToken_from_subprocess(p):
    stdout, _ = p.communicate()

    # Make sure it didn't blow up.
    assert p.returncode == 0

    for line in stdout.split('\n'):
        if 'recoveryToken' in line:
            recoveryToken = line.split('recoveryToken: ')[1].strip()
            return recoveryToken


@contextlib.contextmanager
def testing_smtpd():
    # Create an SMTPd that listens on port 2500. This uses Python's
    # multiprocessing library to shell out to Twisted+tac, and then
    # parse its output, but it was the greatest combination of
    # "quickest" and "most reasonable" thing I could do, given the
    # rest of this code, so there you go.

    # Start the process.
    p = subprocess.Popen(
        ['twistd', '-ny' 'testing_smtpd.py'],
        stdout=subprocess.PIPE)

    # Add a busy-loop waiting at most 5 seconds for port 2500 to be
    # available.
    RESOLUTION=0.01
    port_2500_was_opened = False
    for i in range(int(5 * (1/RESOLUTION))):
        try:
            sock = socket.socket()
            sock.connect(('127.0.0.1', 2500))
            port_2500_was_opened = True
            sock.close()
        except socket.error:
            time.sleep(RESOLUTION)

    assert port_2500_was_opened

    # Run whatever code we are context-managing, allowing that code to control the 'p'rocess.
    yield p

    # Finally, if the process is still around, teminate it so that we can start it again later if
    # needed.
    try:
        p.terminate()
    except OSError as e:
        if e.errno != 3:
            raise

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
                   domainReservationToken=None,
                   email='benb@benb.org', recoveryToken=None,
                   x_forwarded_for=None):
    '''This internal helper function allows code-reuse within the tests.'''
    submitted_form_data = {}
    if rawHostname is not None:
        submitted_form_data['rawHostname'] = rawHostname

    if domainReservationToken is not None:
        submitted_form_data['domainReservationToken'] = domainReservationToken

    if email is not None:
        submitted_form_data['email'] = email

    if recoveryToken is not None:
        submitted_form_data['recoveryToken'] = recoveryToken

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
        key_number=1)


def register_benb2_missing_fingerprint():
    return _make_api_call(
        rawHostname='ben-b2',
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


def register_capitalized_ftp_with_benb2_key():
    return _make_api_call(
        external_ip=True,
        rawHostname='FTP',
        key_number=2)


def register_hyphen_start_with_benb2_key():
    return _make_api_call(
        rawHostname='-shouldfail',
        key_number=2)


def register_hyphen_end_with_benb2_key():
    return _make_api_call(
        rawHostname='shouldfail-',
        key_number=2)


def register_two_hyphens_with_benb2_key():
    return _make_api_call(
        rawHostname='should--fail',
        key_number=2)


def register_benb2_successfully_text_plain():
    return _make_api_call(
        rawHostname='ben-b2',
        accept_mime_type='text/plain',
        key_number=2)


def register_benb2_reuse_benb_key():
    return _make_api_call(
        rawHostname='ben-b2',
        key_number=1)


def register_benb2_invalid_email():
    return _make_api_call(
        rawHostname='ben-b2',
        email='benb@benb',
        key_number=2)


def register_benb2_wrong_http_method():
    return _make_api_call(
        rawHostname='ben-b2',
        http_method='get',
        key_number=2)


def register_benb2_missing_sand_cats_header():
    return _make_api_call(
        rawHostname='ben-b2',
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
        rawHostname='ben-b2',
        key_number=1)


def update_benb2_caps_basically_good():
    return _make_api_call(
        path='update',
        external_ip=True,
        rawHostname='BEN-B2',
        x_forwarded_for='128.151.2.1',
        key_number=2)


def send_recovery_token_to_benb3():
    # This causes an email to get sent to the email address
    # on file for the benb3 account.
    #
    # That email contains a domain recovery token that benb3 can
    # provide to the "/recover" method.
    #
    # This function returns the recovery token so that later tests can
    # use the token. To achieve that, we get the help of testing_smtpd()
    # to listen on port 2500 and intercept the mail.
    with testing_smtpd() as p:
        sandcats_response = _make_api_call(
            path='sendrecoverytoken',
            rawHostname='benb3',
            key_number=None
        )
        return get_recoveryToken_from_subprocess(p)


def send_recovery_token_to_nonexistent():
    # This requests recovery of a nonexistent domain. We should see an
    # easy to understand error message saying this domain isn't
    # registered.
    sandcats_response = _make_api_call(
        path='sendrecoverytoken',
        rawHostname='nonexistent',
        accept_mime_type='text/plain',
        key_number=None
    )
    return sandcats_response


def send_recovery_token_to_benb():
    # This exists to support testing how many recoveryTokens can be
    # sent to one person in a short period of time.
    with testing_smtpd() as p:
        sandcats_response = _make_api_call(
            path='sendrecoverytoken',
            rawHostname='benb',
            key_number=None
        )
        return get_recoveryToken_from_subprocess(p)


def recover_benb3_with_fake_recovery_token_and_fresh_cert():
    return _make_api_call(
        path='recover',
        # the following fake recoveryToken is 40 chars long, which
        # passes the input validation, but is not a working recovery
        # token.
        recoveryToken='abcdefghijabcdefghijabcdefghijabcdefghij',
        rawHostname='benb3',
        external_ip=True,
        key_number=4,
        accept_mime_type='text/plain')


def recover_benb3_via_recovery_token_and_fresh_cert(recoveryToken, key_number=4):
    with testing_smtpd() as p:
        sandcats_response = _make_api_call(
            path='recover',
            recoveryToken=recoveryToken,
            rawHostname='benb3',
            external_ip=True,
            key_number=key_number,
            accept_mime_type='text/plain')

        stdout, _ = p.communicate()

        # Make sure the testing SMTPd didn't get upset.
        assert p.returncode == 0

        # In that case, provide the HTTP response.
        return sandcats_response


def recover_benb3_with_fresh_cert_with_no_recovery_token():
    return _make_api_call(
        path='recover',
        rawHostname='benb3',
        external_ip=True,
        key_number=4,
        accept_mime_type='text/plain')


def recover_benb3_via_recovery_token_and_stale_cert(recoveryToken):
    return _make_api_call(
        path='recover',
        rawHostname='benb3',
        external_ip=True,
        key_number=1,
        recoveryToken=recoveryToken,
        accept_mime_type='text/plain')


def update_benb3_after_recovery(external_ip=True):
    return _make_api_call(
        path='update',
        external_ip=external_ip,
        rawHostname='benb3',
        key_number=4,
        accept_mime_type='text/plain')


def reserve_benb4():
    return _make_api_call(
        path='reserve',
        rawHostname='benb4',
        key_number=None)


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
    # Remove data from the Mongo collections that we use.
    os.system('''printf '\n\ndb.userRegistrations.remove({}); \n\nexit \n ' | mongo sandcats_mongo''')
    os.system('''printf '\n\ndb.domainReservations.remove({}); \n\nexit \n ' | mongo sandcats_mongo''')

    # Restart the service if it is running via systemd.
    os.system('sudo service sandcats restart || true')

    # We require a restart of the app, if it's in development mode.
    os.system('killall -INT node')

    time.sleep(1)  # Make sure the restart gets a chance to start, to avoid HTTP 502.

    # Busy-loop waiting for / to get a HTTP response. This way, we avoid restarting nginx
    # until the service is online.
    RESOLUTION = 0.5
    WAIT_SECONDS = 120  # Note that it could be at worst 2x this, since requests.get() blocks for
                        # timeout=RESOLUTION as well.
    got_success = False
    sys.stdout.write('waiting ')
    sys.stdout.flush()
    for i in range(int(WAIT_SECONDS * 1/RESOLUTION)):
        try:
            requests.get('http://localhost:3000', timeout=RESOLUTION)
            got_success = True
            break  # stop the loop since we got what we needed
        except (requests.exceptions.ReadTimeout, requests.exceptions.ConnectionError):
            sys.stdout.write('.')
            sys.stdout.flush()
            continue  # keep looping, maybe it'll work next time!
    assert got_success, "Bailing out - service failed to come up"

    os.system('sudo service nginx restart')
    os.system('sudo service pdns restart')
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
        else:
            # If the values are different, we can stop
            # looping/sleeping.
            break

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
    assert_nxdomain(resolver, 'ben-b2.sandcatz.io', 'A')

    # Attempt to register ftp as a domain. This should fail, and if it
    # does successfully fail, then we can be reasonably confident that
    # all the various blocked/disallowed names also fail.
    response = register_ftp_with_benb2_key()
    assert response.status_code == 400, response.content
    parsed_content = response.json()
    assert (
        parsed_content['text'] ==
        'This hostname is already in use. Type help if you need to recover access, or pick a new one.'
    )
    assert_nxdomain(resolver, 'ftp.sandcatz.io', 'A')

    # Attempt to register FTP (uppercase). Same as previous test; this
    # verifies domain blocking is case-sensitive.
    response = register_capitalized_ftp_with_benb2_key()
    assert response.status_code == 400, response.content
    parsed_content = response.json()
    assert (
        parsed_content['text'] ==
        'This hostname is already in use. Type help if you need to recover access, or pick a new one.'
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
    assert_nxdomain(resolver, 'ben-b2.sandcatz.io', 'A')

    # Attempt to register benb2 with a bad email address.
    response = register_benb2_invalid_email()
    assert response.status_code == 400, response.content
    parsed_content = response.json()
    assert (
        parsed_content['text'] ==
        'Please enter a valid email address.'
    ), parsed_content['text']
    assert_nxdomain(resolver, 'ben-b2.sandcatz.io', 'A')

    # Attempt to do a GET to /register. Get rejected since /register always
    # wants a POST.
    response = register_benb2_wrong_http_method()
    assert response.status_code == 403, response.content
    parsed_content = response.json()
    assert (
        parsed_content['text'] ==
        'Must POST.')
    assert_nxdomain(resolver, 'ben-b2.sandcatz.io', 'A')

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
    assert_nxdomain(resolver, 'ben-b2.sandcatz.io', 'A')

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
    assert response.content == 'This hostname is already in use. Type help if you need to recover access, or pick a new one.'

    # Finally, register benb2 successfully.
    response = register_benb2_successfully_text_plain()
    assert response.status_code == 200, response.content
    assert response.headers['Content-Type'] == 'text/plain'
    assert response.content == 'Successfully registered!'
    wait_for_nxdomain_cache_to_clear(resolver, 'ben-b2.sandcatz.io', 'A')
    dns_response = resolver.query('ben-b2.sandcatz.io', 'A')
    assert str(dns_response.rrset) == 'ben-b2.sandcatz.io. 60 IN A 127.0.0.1'


def test_reserve_domain():
    # Per sandcats issue #119, we support reserving a domain, which generates a "domain registration
    # token", which then can be used against the /registerreserved API to actually set up the
    # sandcats key and generate a HTTPS keypair.

    # Test some things that should fail to reserve properly.

    # Expect error for a domain name in the blacklist.
    response = _make_api_call(path='reserve', key_number=None, rawHostname='ftp')
    assert response.status_code == 400, response.content

    # Expect error for a domain name that is already in use.
    response = _make_api_call(path='reserve', key_number=None, rawHostname='benb3')
    assert response.status_code == 400, response.content

    # Expect error for a domain name that is not in use, but forgot to submit email address.
    response = _make_api_call(path='reserve', key_number=None, email=None, rawHostname='benb4')
    assert response.status_code == 400, response.content

    # Expect success for an unreserved & unused domain.
    response = reserve_benb4()
    assert response.status_code == 200, response.content
    parsed_content = response.json()

    # Expect error for reserving the same domain again.
    response = reserve_benb4()
    assert response.status_code == 400, response.content

    # We need to allow web browsers to POST to /reserve from JS running on any domain.
    cors_header = response.headers.get('Access-Control-Allow-Origin', '')
    assert cors_header == '*', cors_header

    # Make sure we got back some kind of reasonable, non-empty token.
    token = parsed_content['token']
    assert len(token) == 40

    # Demonstrate that /recover returns status 400 even for the "right" token.
    response = _make_api_call(path='recover',
                              recoveryToken=('a' * 40),
                              rawHostname='benb4',
                              key_number=5)
    assert response.status_code == 400, response.content


    # Demonstrate that /registerreserved returns 400 for wrong token and 200 for right token.
    response = _make_api_call(path='registerreserved',
                              domainReservationToken=('a' * 40),
                              rawHostname='benb4',
                              key_number=5)
    assert response.status_code == 400, response.content

    response = _make_api_call(path='registerreserved',
                              domainReservationToken=token,
                              rawHostname='benb4',
                              key_number=5)
    assert response.status_code == 200, response.content


def test_recovery():
    # Per sandcats issue #49, we support the ability for users to
    # request an email to be sent to them that grants them
    # authorization to re-register a domain.

    # First, let's try to steal benb3's domain by providing a
    # recoveryToken that is invalid. We're hopeful for a 400.
    response = recover_benb3_with_fake_recovery_token_and_fresh_cert()
    assert response.status_code == 400, response.content

    # Let's try to recover a nonexistent domain, just to make sure the
    # backend isn't too shocked by this.
    response = send_recovery_token_to_nonexistent()
    assert response.status_code == 400, response.content
    assert response.content == 'There is no such domain. You can register it!', response.content

    # Now, let's send a recoveryToken to benb3. This function returns
    # the actual token, which is good, because we need it later.
    #
    # (It mocks out email sending, too, which is nice because it means
    # we don't end up sending lots of emails to ben@benb3.org.)
    recoveryToken = send_recovery_token_to_benb3()
    assert recoveryToken, "Sad, we needed a recoveryToken but we got %s instead" % (recoveryToken,)

    # Now, let's attempt again to use the invalid recovery token, just
    # in case we caused some horrifying state change that makes
    # benb3's account pwnable.
    response = recover_benb3_with_fake_recovery_token_and_fresh_cert()
    assert response.status_code == 400, response.content

    # And let's attempt to re-register benb3's domain with a fresh
    # cert and no recovery token, and hope that doesn't work either.
    response = recover_benb3_with_fresh_cert_with_no_recovery_token()
    assert response.status_code == 400, response.content

    # Attempt to re-register benb3's domain with a re-used key, but
    # the right recovery token, and hope that doesn't work either.
    response = recover_benb3_via_recovery_token_and_stale_cert(recoveryToken)
    assert response.status_code == 400, response.content

    # OK! So finally let's re-register benb3's domain, with a fresh
    # cert and the right recovery token.
    response = recover_benb3_via_recovery_token_and_fresh_cert(recoveryToken)
    assert response.content == 'OK! You have recovered your domain. Next we will update your IP address.', response.content
    assert response.status_code == 200

    # Try to do it a second time; discover that the token only works once.
    response = recover_benb3_via_recovery_token_and_fresh_cert(recoveryToken, key_number=5)
    assert response.content == 'Bad recovery token.', response.content
    assert response.status_code == 400

    # Try to get three recovery tokens right after each other.
    #
    # The first two should succeed; the latter two should fail.
    #
    # We request for benb, not benb3, so that we test a fresh account.
    for i in range(3):
        recoveryToken = send_recovery_token_to_benb()
        if i in [0, 1]:
            assert recoveryToken, "The first two attempts should work but we got %s instead." % (
                recoveryToken,)
        if i == 2:
            assert not recoveryToken, "We expect to be denied but we got %s instead." % (
                recoveryToken,)

    # Now test a real update. The install script will use the /update
    # if it is taking over an existing domain, since that method
    # requires only a hostname and pubkey.
    response = update_benb3_after_recovery()
    try:
        assert response.status_code == 200, response.content
    except:
        import pdb; pdb.set_trace()
    # Make sure DNS is updated.
    resolver = get_resolver()
    wait_for_new_resolve_value(resolver,
                               'benb3.sandcatz.io',
                               'A',
                               'benb3.sandcatz.io. 60 IN A 127.0.0.1')
    # Now, let's set benb3 back to 127.0.0.1, so the rest of the test
    # suite doesn't get surprised.
    response = update_benb3_after_recovery(external_ip=False)
    assert response.status_code == 200


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
                               'ben-b2.sandcatz.io',
                               'A',
                               'ben-b2.sandcatz.io. 60 IN A 127.0.0.1')


def test_udp_protocol():
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
    # from localhost. Use a slightly different constant so we know
    # we're not being somehow fooled by duplicate messages.
    message = 'benb3 abcdef0123456789'
    try:
        client = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        client.sendto(message, (UDP_DEST_IP, UDP_DEST_PORT))
        client.settimeout(1)
        data = client.recv(1024)
        assert False, "We were hoping for no response, but got " + repr(data)
    except socket.timeout:
        # Hooray! No response.
        print "."
    finally:
        client.close()


if __name__ == '__main__':
    if '--reset-app-state' in sys.argv:
        reset_app_state()
        sys.exit(0)

    test_register()
    test_recovery()
    test_update()
    test_reserve_domain()
    test_udp_protocol()

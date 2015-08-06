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
set +x
for i in $(seq 90)
do
  nc -z localhost 3000
  retval=$?
  if [[ $retval == "0" ]]; then
    echo -n '+'
    break
  else
    sleep 1
    echo -n '.'
  fi
done
# Make sure anything we prented before is newline-terminated.
echo

set -e  # Failure is no longer OK!

# Adjust pdns configuration so the cache TTL is shorter. This way, the
# tests run faster.

printf '### testing optimizations\ncache-ttl=1\nnegquery-cache-ttl=1\nquery-cache-ttl=1\n### end testing optimizations' | sudo dd of=/etc/powerdns/pdns.conf conv=notrunc oflag=append
sudo service pdns restart

# Restart nginx, in case it is wants to be all 502-y
sudo service nginx restart

make action-run-tests

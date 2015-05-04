#!/bin/bash
set +e  # failure OK for now...
set -x

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

# Now, actually run the tests
make action-run-tests

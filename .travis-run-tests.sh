#!/bin/bash
set +e  # failure OK for now...
set -x

pushd /vagrant/sandcats
MONGO_URL=mongodb://localhost/sandcats_mongo meteor run --settings /etc/sandcats-meteor-settings.json &
popd

# Wait for Meteor to come online, up to N seconds.
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

# Restart nginx, in case it is wants to be all 502-y
sudo service nginx restart

# Now, actually run the tests
make action-run-tests


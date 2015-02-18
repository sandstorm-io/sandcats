# Sandcats dynamic DNS server software

This is an open source (Apache License 2.0) software package that can
be installed on a Linux server that creates a dynamic DNS zone. It
speaks an API that the Sandstorm server will implement support for, so
that when people install the Sandstorm personal server platform, they
can have a DNS zone with dynamic updates.

It uses the following technologies:

* Meteor, to access MongoDB and eventually provide a web interface;

* node's dgram support, to allow servers to check in periodically and
  for us to reply to them to tell them if their IP address has
  changed;

* PowerDNS and MySQL, to update a DNS zone with the new IP address of
  a user.

# Alternatives

If you want a general-purpose dynamic DNS service to use with your own
non-Sandstorm server, check out the list below.

Similarly, if you want to run a dynamic DNS service for the Internet,
you might prefer the software in the list below. The Sandcats software
has very few features.

Other software/services:

* NSUpdate.info: free of cost public service; open source backend.

* duckdns.com: free of cost public service; very responsive
  maintainers; backend unavailable.

# How to run this

## Install dependencies

Note that we currently assume the software is being run on Debian
jessie. (Ubuntu will probably work fine.)

To run this in development mode, install the dependency packages as
follows:

```
$ make
```

This will use the Makefile at the top level of this repository to make
sure your system has all the needed dependencies. Read that file if
you are curious what the package needs.

## Configure database

For now, this is a manual process:

```
echo "CREATE DATABASE sandcats_pdns;" | mysql -uroot
TMPFILE="$(mktemp /tmp/sandcats.XXXXXX)"
pwgen -s 16 > "$TMPFILE"
echo "CREATE USER sandcats_pdns IDENTIFIED BY '$(cat $TMPFILE)';" | mysql -uroot
echo "GRANT ALL on sandcats_pdns.* TO 'sandcats_pdns'@'localhost';" | mysql -uroot
```

## Create Meteor configuration file

The `sandcats/dev-settings.json` file should contain approximately the following:

```
{"NS1_HOSTNAME": "ns1.sandcatz.io",
 "NS2_HOSTNAME": "ns2.sandcatz.io",
 "BASE_DOMAIN": "sandcatz.io",
 "POWERDNS_USER": "sandcats_pdns",
 "POWERDNS_DB": "sandcats_pdns",
 "POWERDNS_PASSWORD": "3Rb4k4BQqKr59Ewj",
 "UDP_PING_PORT": 8080
}
```

If you chose a different database name or password etc., then by all
means adjust the configuration accordingly.

## Start the server

```
$ cd sandcats
$ meteor run --settings dev-settings.json
```

# Production use

Production use is presumably very similar to the above. However, I
haven't really used this in production yet, so who knows.

## Simulating production with Vagrant

To set up a simular environment to production, do the following:

```
$ vagrant up
# This should set up nginx on port 443 within the VM.
#
# You can access it as port 8443 on the host.
```

# Design questions that have not yet been answered

## High-availability

A typical goal for a DNS service is that there are multiple servers,
preferably spread around the globe, that respond to DNS queries. This
permits the DNS zone to operate even if a DNS server becomes
unreachable due to problems on the server or perhaps network problems.

We want to avoid using AXFR on every update because that would mean
that every update would be an O(N) operation.

One option is to switch to the PowerDNS sqlite backend, and every few
minutes if there have been changes, copy that from the primary host to
the secondary host(s). I can't say I love that option. Similarly, we
could use MySQL replication, which would be more efficient, but harder
to set up.

Other possibilities:

* Write some scripts that can SSH into a target machine and set up
  MySQL replication; if the SSH connection goes down, then we could
  take some drastic action and e.g. destroy the secondary.

* BerkeleyDB's SQLite-API-compatible replication
  http://www.oracle.com/technetwork/database/database-technologies/berkeleydb/overview/index.html

* Do SQLite inserts over a HTTP API that does replication
  https://github.com/otoolep/rqlite

If you have ideas, I'd love to hear them.

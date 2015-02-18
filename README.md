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

## Production use

Production use is presumably very similar to the above. However, I
haven't really used this in production yet, so who knows.

# Design questions that have not yet been answered

## High-availability

A typical goal for a DNS service is that there are multiple servers,
preferably spread around the globe, that respond to DNS queries. This
permits the DNS zone to operate even if a DNS server becomes
unreachable due to problems on the server or perhaps network problems.

We want to avoid using AXFR on every update because that would mean
that every update would be an O(N) operation.

If you have ideas, I'd love to hear them.

# Alternatives

If you want to run your own dynamic DNS server software, or you want
to use a free of cost public dynamic DNS service, you might prefer to
use an open source dyndns backend package that is more generic. I
chose to implement this independent from the below offerings because
Sandstorm (at the moment) needs a small subset of dynamic DNS
features.

* Open source backend, free of cost public server: NSUpdate.info.

* Backend not available, free of cost public server, very responsive
  maintainers: duckdns.com.

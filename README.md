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
# This should set up nginx on port 80 & 443 within the VM.
#
# You can access it as port 8080 & 8443 on the host.
$ vagrant reload
$ vagrant ssh
$ cd /vagrant
$ make stage-provision
$ sudo service sandcats restart
$ sudo service nginx restart
# Perversely, this is necessary for now, since the base box we
# are using needs a reboot before it switches into using systemd.
#
# Plus you have to wait a minute or two for the sandcats service
# to finish installing Meteor.
#
# You can watch that with: sudo tail -f /var/log/syslog
$
```

# Roadmap for sandcats & sandstorm

## Version 1

* The Sandstorm installer should be able to register a domain using
  against the Sandcats software. The Sandstorm installer needs to be
  able to generate a client certificate. If the `openssl` command is
  not installed, and /usr/bin/apt-get exists, ask if the user wants to
  install it.

* Version 1 stores email addresses, but it does not verify them for now.

* The Sandcats web app has no meaningful web interface.

## Version 2

* The Sandstorm shell will offer a user interface that asks people to
  confirm their email address so they can recover their domain name if
  they lose the private key they use to do updates. The shell will
  have a button that says, "Click here to confirm your Sandcats
  account," and when they click it, the shell will generate a random
  number and tell them to wait for a confirmation email that the
  Sandcats server will send them, and then once they click that
  confirmation email, the Sandcats server will prompt them to enter
  the number, and when they do, Sandcats will believe that they
  confirmed their email address. (Question: How will the Sandstorm
  shell know that the user actually did the email confirmation?)

* The Sandstorm installer can offer users the ability to use a name
  they already registered. This will use an email confirmation-based
  flow to let them recover control of the name.

    * Particularly, if they try to use a name that was already
      registered, and either the host hasn't checked-in recently or
      this client has the same IP as the host's last checked-in IP
      address, then in the installer, print a random number and also
      secretly sends its registration info to the Sandcats server. It
      also tells them to wait for an email, into which to type that
      number. Once they type that number, and this action by itself is
      what makes the new address record take place. Therefore, the
      Sandstorm installer just says, "Press enter once you've completed
      that, or Ctrl-C to interrupt the install."

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

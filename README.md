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

# How to run this: Three ways

## Way 1: Production-style

In production, the following are true:

* We download the latest version of Sandcats from git master and
  use "meteor build" to package that up into a tidy little directory.

* We use a particular version of nodejs that we download from
  the nice node people.

* When we want to upgrade, we run `make action-deploy-app`, which
  means you don't get to enjoy the fun of Meteor auto-reload.

You can simulate production-style by using Vagrant and doing the
following:

```
$ vagrant up
# After vagrant up, you should set up nginx on port 80 & 443
# within the VM.
#
# You can access it as port 8080 & 8443 on the host.
$ vagrant reload
# Hilariously, the Vagrant basebox we're using doesn't have
# systemd by default, so we must reboot into systemd.
$ vagrant ssh
# Log in, so you can pick up where it left off.
$ cd /vagrant
$ make stage-provision
# Great! Now surf to localhost:8080 and/or https://localhost:8443/.
```

If you want, you can run some automated tests:

```
$ vagrant ssh
$ cd /vagrant
$ make action-run-tests
```

## Way 2: Using Vagrant, but with code auto-reload

Do something very like the above, but then:

```
$ sudo service sandcats stop
$ cd /vagrant/sandcats
$ meteor run --settings=dev-settings.json
```

## Way 3: On your own machine, without Vagrant

This will work, but since there are a lot of dependencies, you'll be mostly on your own. Here's the overview:

### Install dependencies

To run this in development mode, install the dependency packages as
follows:

```
$ make
```

This will use the Makefile at the top level of this repository to make
sure your system has all the needed dependencies. Read that file if
you are curious what the package needs.

### Configure MySQL database

Here's a manual process you can do:

```
echo "CREATE DATABASE sandcats_pdns;" | mysql -uroot
TMPFILE="$(mktemp /tmp/sandcats.XXXXXX)"
pwgen -s 16 > "$TMPFILE"
echo "CREATE USER sandcats_pdns IDENTIFIED BY '$(cat $TMPFILE)';" | mysql -uroot
echo "GRANT ALL on sandcats_pdns.* TO 'sandcats_pdns'@'localhost';" | mysql -uroot
```

### Create Meteor configuration file

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

### Start the server

```
$ cd sandcats
$ meteor run --settings dev-settings.json
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

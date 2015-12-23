# By default, set things up for development on a Debian/Ubuntu-y
# system that the developer uses for other things as well.
all: stage-dev-setup

stage-dev-setup: /usr/local/bin/meteor /usr/share/doc/mysql-server /usr/share/doc/pdns-backend-mysql

# Optionally, in the "provision" target, assume that the system will
# be used 100% for running Sandcats. Therefore, we set Sandcats up as
# a system service, and are sure to install 100% of the
# pre-requisites.
#
# If used for production, the following customizations will be needed:
#
# - Replace its HTTPS keys with non-snakeoil.
stage-provision: stage-dev-setup stage-mongodb-setup stage-mysql-setup stage-setup-powerdns stage-install-service action-deploy-app stage-nginx-setup

# action-deploy-app is an extra phony target -- every time you 'make
# action-deploy-app', it creates a new build, drops it in
# /srv/sandcats, twiddles a symlink to point at it, and then reloads
# the service.
action-deploy-app: stage-install-service action-update-source
	if sudo grep -q systemd /proc/1/exe ; then sudo systemctl restart sandcats.service ; fi

action-run-dev:
	# If we are using VirtualBox file sharing, work around race conditions in vboxsf by playing
	# games with loopback mounts.
	mkdir -p /tmp/meteor-local
	if mount | grep -q vboxsf ; then if ! mount | grep -q /vagrant/sandcats/.meteor/local ; then sudo mount --bind /tmp/meteor-local /vagrant/sandcats/.meteor/local ; fi; fi
	(cd sandcats ; MAIL_URL=smtp://localhost:2500 meteor run --settings=dev-settings.json )

action-run-tests: /usr/share/doc/python-requests /usr/share/doc/python-dnspython /usr/share/doc/python-netifaces /usr/share/doc/python-twisted
	cd sandcats && python -u integration_tests.py

action-reset-app-state: /tmp/can-reset-state /usr/share/doc/python-requests /usr/share/doc/python-dnspython /usr/share/doc/python-netifaces /usr/share/doc/python-twisted
	cd sandcats && python integration_tests.py --reset-app-state

action-run-unit-tests:
	(cd sandcats ; tail -c 0 --retry -f ./.meteor/local/log/jasmine-server-integration.log & (meteor --test --settings=dev-settings.json 2>&1 || true) | python ../meteor-testing-nonsense/input-filter.py )

action-run-unit-tests-continuously:
	(cd sandcats ; tail --retry -f ./.meteor/local/log/jasmine-server-integration.log & meteor --test --settings=dev-settings.json )

/srv/sandcats/source/.git: /usr/share/doc/git
	sudo mkdir -p /srv/sandcats/source
	sudo chown -R vagrant /srv/sandcats/source
	sudo -H -u vagrant git clone https://github.com/sandstorm-io/sandcats.git /srv/sandcats/source

/opt/node-v0.10.33-linux-x64:
	$(eval TMPDIR := $(shell mktemp -d /tmp/nodejs.XXXXXXX))
	# Download the tarball, and check it against a SHA that we verified earlier.
	cd $(TMPDIR) && wget https://nodejs.org/dist/v0.10.33/node-v0.10.33-linux-x64.tar.gz
	cd $(TMPDIR) && sha256sum node-v0.10.33-linux-x64.tar.gz | grep 159e5485d0fb5c913201baae49f68fd428a7e3b08262e9bf5003c1b399705ca8
	cd $(TMPDIR) && tar zxf node-v0.10.33-linux-x64.tar.gz
	cd $(TMPDIR) && sudo mv node-v0.10.33-linux-x64 /opt

/usr/local/bin/npm: /opt/node-v0.10.33-linux-x64
	sudo ln -sf /opt/node-v0.10.33-linux-x64/bin/npm /usr/local/bin/npm

/usr/local/bin/node:
	sudo ln -sf /opt/node-v0.10.33-linux-x64/bin/node /usr/local/bin/node

action-update-source: /usr/local/bin/node /usr/local/bin/npm /srv/sandcats/source/.git
	# Get latest code.
	cd /srv/sandcats/source && sudo -H -u vagrant git pull --rebase
	# Create a human-friendly timestamp for this build.
	$(eval BUILDNAME := $(shell date -I).$(shell GIT_DIR=/srv/sandcats/source/.git git rev-parse HEAD).$(shell date +%s))
	sudo mkdir /srv/sandcats/$(BUILDNAME)  # fail if this already exists
	sudo mkdir /srv/sandcats/$(BUILDNAME)/build
	sudo chown vagrant -R /srv/sandcats/$(BUILDNAME)
	cd /srv/sandcats/source/sandcats && sudo -H -u vagrant meteor build /srv/sandcats/$(BUILDNAME)/build
	cd /srv/sandcats/$(BUILDNAME) && sudo -H -u vagrant tar zxf build/sandcats.tar.gz
	cd /srv/sandcats/$(BUILDNAME)/bundle && (cd programs/server && sudo -H -u vagrant npm install)
	# Now, declare this is the current build, and restart the service.
	cd /srv/sandcats && sudo rm -f current && sudo ln -sf $(BUILDNAME) current
	if sudo grep -q systemd /proc/1/exe ; then sudo systemctl restart sandcats.service ; fi

stage-install-service: /etc/systemd/multi-user.target.wants.sandcat.service

stage-mongodb-setup: /usr/share/doc/mongodb-server /etc/sandcats-meteor-settings.json
	echo 'export MONGO_URL=mongodb://localhost/sandcats_mongo' >> $$HOME/.bash_profile

	# Make sure our MongoDB configuration file is the active one.
	sudo cp conf/mongodb.conf /etc/
	sudo service mongodb restart

stage-mysql-setup: /usr/share/doc/mysql-server /etc/mysql/conf.d/sandcats-replication.cnf
	echo 'create database if not exists sandcats_pdns;' | mysql -uroot
	# The following is a fancy way to only run the SQL queries if they have
	# not already been already run.
	echo 'show tables like "domains"' | mysql -uroot sandcats_pdns | grep -q . || mysql -uroot sandcats_pdns < /usr/share/doc/pdns-backend-mysql/schema.mysql.sql
	echo "GRANT ALL on sandcats_pdns.* TO 'sandcats_pdns'@'localhost' IDENTIFIED BY '3Rb4k4BQqKr59Ewj';" | mysql -uroot

/etc/mysql/conf.d/sandcats-replication.cnf: conf/sandcats-replication.cnf
	sudo cp conf/sandcats-replication.cnf /etc/mysql/conf.d/sandcats-replication.cnf
	sudo service mysql restart

	# Enable binlogging, so that we can have replication.

stage-setup-powerdns: /etc/powerdns/pdns.d/pdns.sandcats.conf
	# Now that we know our conf file has been slotted into place,
	# we can remove the other conf files we don't need.
	#
	# Debian bundles & generates some "local" files; the sandcats
	# file is all we need, so make sure those are gone.
	sudo rm -f /etc/powerdns/pdns.d/pdns.local.*

	# We also install our own, simplistic master top-level conf
	# file.
	sudo cp conf/pdns.conf /etc/powerdns/pdns.conf
	sudo chown root.root /etc/powerdns/pdns.conf
	sudo chmod 0600 /etc/powerdns/pdns.conf

	# Reload PowerDNS configuration to make sure our changes are picked up.
	sudo service pdns restart

/etc/powerdns/pdns.d/pdns.sandcats.conf:
	sudo cp conf/pdns.sandcats.conf /etc/powerdns/pdns.d/pdns.sandcats.conf
	sudo chown root.root /etc/powerdns/pdns.d/pdns.sandcats.conf
	sudo chmod 0600 /etc/powerdns/pdns.d/pdns.sandcats.conf

stage-nginx-setup: stage-nginx-install stage-nginx-configure

stage-nginx-install: /etc/apt/sources.list.d/nginx-development-ppa.list /usr/share/doc/nginx

stage-nginx-configure: stage-certificate-configure /etc/nginx/sites-available/default

stage-certificate-configure: /usr/share/doc/ssl-cert

/etc/systemd/multi-user.target.wants.sandcat.service: /usr/share/doc/systemd-sysv /etc/systemd/system/sandcats.service
	sudo systemctl enable sandcats.service

### Conf files that just need to be copied into place.
/etc/nginx/sites-available/default: conf/nginx/$(@F)
	sudo cp $<$(@F) $@
	sudo chmod 0644 $@
	sudo service nginx restart

/etc/sandcats-meteor-settings.json:
	# The purpose of this Makefile target is to create a
	# reasonable sample ettings file, but never modify it.
	#
	# This Makefile target carefully does not depend on
	# conf/sample-meteor-settings.json because otherwise in
	# production it would end up modifying the live settings file.
	#
	# If you actively want to reset the server's settings to default,
	# you can do: 'make /etc/sandcats-meteor-settings.json'.
	#
	# As an extra precaution, when you run this rule, it attempts
	# to move any existing settings file into /var/backup. We use
	# --backup=numbered so that we never lose a settings file.
	if [ -f /etc/sandcats-meteor-settings.json ] ; then sudo mv --backup=numbered /etc/sandcats-meteor-settings.json /var/backups ; fi
	sudo cp conf/sample-meteor-settings.json /etc/sandcats-meteor-settings.json

/etc/systemd/system/sandcats.service: /usr/share/doc/systemd-sysv conf/$(@F)
	# $(@F) refers to sandcats.service.
	#
	# $@ refers to the full path we are trying to create.
	sudo cp conf/$(@F) $@
	sudo chmod 0644 $@

# Here we use the nginx-development PPA, with packages targeted at
# Ubuntu 14.04.
#
# Although we're on Debian stable, and these are built with Ubuntu
# 14.04 as the target, they will probably work. We do this so we can
# get a version of nginx >= 1.7.2, since that is the version that
# introduced some client certificate smarts that we want.
/etc/apt/sources.list.d/nginx-development-ppa.list:
	echo "deb http://ppa.launchpad.net/nginx/development/ubuntu trusty main" | sudo dd of=/etc/apt/sources.list.d/nginx-development-ppa.list
	sudo apt-key adv --keyserver keyserver.ubuntu.com --recv-keys 8B3981E7A6852F782CC4951600A6F0A3C300EE8C
	sudo apt-get --quiet=2 update >/dev/null

### A tricky apt-get rule. The idea here is that other rules can
### depend on a package being installed on the system by depending on
### the filesystem-path of /usr/share/doc/$packagename.
###
### If we need to install it, then we install it.
/usr/share/doc/%:
	sudo DEBIAN_FRONTEND=noninteractive apt-get --quiet=2 install -y $(@F) >/dev/null

### Rule to install Meteor. Since Meteor installs itself to
### /usr/local/bin/meteor when its install completes, this seems
### pretty reasonable.
/usr/local/bin/meteor: /usr/share/doc/curl
	# We use a local snapshot of the Meteor installer, which in
	# effect pins the Meteor version to 1.0.3.2, to avoid version
	# skew.
	sh vendor/install-meteor 2>/dev/null >/dev/null
	# Switch to the 'vagrant' user and run meteor --version, to ensure
	# it is fully installed.
	sudo -H -u vagrant meteor --version 2>/dev/null
	# Run meteor --version as ourselves, whoever we are, just to make
	# sure that it is fully installed for us, too.
	meteor --version 2>/dev/null

### Pseudo-target - you must touch this file yourself, since I really don't
### want this getting executed in production.
/tmp/can-reset-state:
	@echo "You must run:"
	@echo '$$ touch /tmp/can-reset-state'
	exit 1

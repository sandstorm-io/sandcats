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
stage-provision: stage-dev-setup stage-mongodb-setup stage-mysql-setup stage-install-service stage-nginx-setup

stage-install-service: /etc/systemd/multi-user.target.wants.sandcat.service

stage-mongodb-setup: /usr/share/doc/mongodb-server
	echo 'export MONGO_URL=mongodb://localhost/mongo_sandcats' >> $$HOME/.bash_profile

	# Make sure our MongoDB configuration file is the active one.
	sudo cp conf/mongodb.conf /etc/
	sudo service mongodb restart

stage-mysql-setup: /usr/share/doc/mysql-server
	echo 'create database if not exists sandcats_pdns;' | mysql -uroot
	# The following is a fancy way to only run the SQL queries if they have
	# not already been already run.
	echo 'show tables like "domains"' | mysql -uroot sandcats_pdns | grep -q . || mysql -uroot sandcats_pdns < /usr/share/doc/pdns-backend-mysql/schema.mysql.sql
	echo "GRANT ALL on sandcats_pdns.* TO 'sandcats_pdns'@'localhost' IDENTIFIED BY '3Rb4k4BQqKr59Ewj';" | mysql -uroot

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

/etc/sandcats-meteor-settings.json: conf/sample-meteor-settings.json
	sudo cp $<$(@F) $@

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
	sudo apt-get -q update

### A tricky apt-get rule. The idea here is that other rules can
### depend on a package being installed on the system by depending on
### the filesystem-path of /usr/share/doc/$packagename.
###
### If we need to install it, then we install it.
/usr/share/doc/%:
	sudo DEBIAN_FRONTEND=noninteractive apt-get install -q -y $(@F)

### Rule to install Meteor. Since Meteor installs itself to
### /usr/local/bin/meteor when its install completes, this seems
### pretty reasonable.
/usr/local/bin/meteor: /usr/share/doc/curl
	curl https://install.meteor.com/ | sh

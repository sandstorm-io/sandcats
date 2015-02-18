# By default, set things up for development on a Debian/Ubuntu-y
# system that the developer uses for other things as well.
all: dev-setup

dev-setup: /usr/local/bin/meteor /usr/share/doc/mysql-server /usr/share/doc/pdns-backend-mysql

# Optionally, in the "provision" target, assume that the system will
# be used 100% for running Sandcats. Therefore, we set Sandcats up as
# a system service, and are sure to install 100% of the
# pre-requisites.
#
# If used for production, the following customizations will be needed:
#
# - Replace its HTTPS keys with non-snakeoil.
provision: dev-setup mysql-setup /etc/systemd/multi-user.target.wants.sandcat.service

mysql-setup:
	echo 'create database if not exists sandcats_pdns;' | mysql -uroot
	mysql -uroot sandcats_pdns < /usr/share/doc/pdns-backend-mysql/schema.mysql.sql
	echo "GRANT ALL on sandcats_pdns.* TO 'sandcats_pdns'@'localhost' IDENTIFIED BY '3Rb4k4BQqKr59Ewj';" | mysql -uroot

/etc/systemd/multi-user.target.wants.sandcat.service: /usr/share/doc/systemd-sysv /etc/systemd/system/sandcats.service
	sudo systemctl enable sandcats.service

nginx-setup: /usr/share/doc/nginx

### Conf files that just need to be copied into place.
/etc/systemd/system/sandcats.service: /usr/share/doc/systemd-sysv conf/$(@F)
	# $(@F) refers to sandcats.service.
	#
	# $@ refers to the full path we are trying to create.
	sudo cp conf/$(@F) $@
	sudo chmod 0644 $@

### A tricky apt-get rule. The idea here is that other rules can
### depend on a package being installed on the system by depending on
### the filesystem-path of /usr/share/doc/$packagename.
###
### If we need to install it, then we install it.
/usr/share/doc/%:
	sudo DEBIAN_FRONTEND=noninteractive apt-get install -y $(@F)

### Rule to install Meteor. Since Meteor installs itself to
### /usr/local/bin/meteor when its install completes, this seems
### pretty reasonable.
/usr/local/bin/meteor: /usr/share/doc/curl
	curl https://install.meteor.com/ | sh

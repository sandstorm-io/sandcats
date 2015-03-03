# This is "some assembly required" probably.
#
# Before running this, you should add a line to /etc/hosts like
#
# master 10.0.0.3
#
# and configure autossh so that localhost port 6446 points at the
# remote mysqld.

# The point of the Makefile is to get the following to be true for the
# secondary DNS server.
#
# * MySQL is installed.
#
# * On system bootup, we SSH to master and get a My
#
#
#

# Steps:
#
#
# On the primary, create a local user account called mysqlsecondary.
#
# On the secondary, look at MYSQL_PRIMARY_IP_ADDRESS environment
# variable and add that into /etc/hosts.
#
# On the secondary, create a local user account called mysqlbridge and
# do ssh-keygen -t rsa. Add ~/.ssh/id_rsa.pub to the mysqlsecondary
# account on the primary.
#
# Set up autossh or inetd-based tunnel so that connecting to localhost
# port 6446 results in a MySQL prompt. Sample test:
#
# echo 'select 1+1' | mysql -uslave -pslave 6446 | grep 2
#
# Install MySQL on the secondary. Accept Debian's defaults.
#
# Stop the MySQL service.
#
# On the primary, create a backup. Use innobackupex so that you get a
# directory that you can tar up and scp over.
#
# Add /etc/mysql/my.cnf and /etc/mysql/debian.cnf to the files that
# get backed up.
#
# Copy that to the secondary.
#
# Stop MySQL service.
#
# Copy the backed-up database etc. into /var
#
# Copy /etc/mysql/debian.cf into place.
#
# Modify /etc/mysql/my.cnf so that it has server-id=$(date +%s)
#
# idea from
# http://www.semicomplete.com/blog/geekery/simple-mysql-slave-id-scaling.html
#
# On the primary, do GRANT REPLICATION SLAVE on *.* to
# 'repl'@'127.0.0.1' IDENTIFIED BY 'pass';
#
# On the secondary, make sure you can

#
# 2. Copy the backed-up data to the secondary, and use its /var/lib/mysql.
#
# This also requires dealing with debian-sys-maint.
#
# sudo service mysql stop
#
#
#
# 3. Configure primary to allow replication from localhost. (We use
# SSH for authorization/authentication.)
#
# 4. Copy the primary's /etc/mysql/my.cnf, but make server-id=2.
#
# 5.


# TODO list:
#
# * Make sure primary is actually using InnoDB.

stage-before-authorize: stage-configure-hosts stage-configure-keypair

stage-configure-hosts: /usr/share/doc/moreutils
	# Remove any lines that point to mysqlprimary.
	grep -v mysqlprimary /etc/hosts | sudo sponge /etc/hosts
	# Add the MySQL primary that someone just told us about.
	echo $$MYSQL_PRIMARY_IP_ADDRESS mysqlprimary | sudo dd of=/etc/hosts conv=notrunc oflag=append

stage-configure-keypair: /home/mysqlbridge
	# Create SSH keypair, if needed.
	sudo -u mysqlbridge mkdir -m 0700 ~mysqlbridge/.ssh
	sudo -u mysqlbridge bash -c '[ -f ~mysqlbridge/.ssh/id_rsa ] || ssh-keygen -t rsa -b 4096 -P "" -f ~mysqlbridge/.ssh/id_rsa'
	# Show it.
	sudo -u mysqlbridge cat ~mysqlbridge/.ssh/id_rsa.pub

/home/mysqlbridge:
	# Create user.
	sudo adduser --home /home/mysqlbridge --gecos 'MySQL Bridge' --disabled-password mysqlbridge

stage-after-authorize: stage-configure-autossh

stage-configure-autossh:
	sudo -u mysqlbridge ssh mysqlprimary echo success in logging in

### A tricky apt-get rule. The idea here is that other rules can
### depend on a package being installed on the system by depending on
### the filesystem-path of /usr/share/doc/$packagename.
###
### If we need to install it, then we install it.
/usr/share/doc/%:
	sudo DEBIAN_FRONTEND=noninteractive apt-get install -q -y $(@F)

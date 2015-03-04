# To test the secondary DNS server, via its Vagrantfile, do:
#
# vagrant up secondary
# vagrant reload secondary  # to get systemd as init system
# vagrant ssh
# cd /vagrant/secondary
# make stage-after-authorize
# make stage-start-secondary

# TODO:
#
# * Make sure primary is actually using InnoDB.

stage-before-authorize: stage-configure-hosts stage-setup-mysql /usr/share/doc/systemd-sysv stage-configure-keypair

stage-configure-hosts: /usr/share/doc/moreutils
	# Let us configure our own hostname, for sysadmin convenience.
	echo secondary | sudo dd of=/etc/hostname
	echo '127.0.0.1 secondary' | sudo dd of=/etc/hosts conv=notrunc oflag=append
	sudo hostname secondary

	# Remove any lines that point to mysqlprimary.
	grep -v mysqlprimary /etc/hosts | sudo sponge /etc/hosts

	# Add the MySQL primary that someone just told us about.
	echo $$MYSQL_PRIMARY_IP_ADDRESS mysqlprimary | sudo dd of=/etc/hosts conv=notrunc oflag=append

stage-setup-mysql: /usr/share/doc/mysql-server /etc/mysql/conf.d/sandcats-replication-secondary.cnf

/etc/mysql/conf.d/sandcats-replication-secondary.cnf: conf/sandcats-replication-secondary.cnf
	# We take the config file snippet that we have, but we replace
	# VAR__CURRENT_DATE with the current UNIX timestamp. The goal
	# is to get non-overlapping sever IDs for our secondary MySQL
	# server(s).
	#
	# That tip courtesy of Jorden Sissel,
	# http://www.semicomplete.com/blog/geekery/simple-mysql-slave-id-scaling.html
	sudo service mysql stop
	cat conf/sandcats-replication-secondary.cnf | sed 's,VAR__CURRENT_DATE,'`date +%s`',' | sudo sponge /etc/mysql/conf.d/sandcats-replication-secondary.cnf
	sudo service mysql start

stage-configure-keypair: /home/mysqlbridge
	# Create SSH keypair, if needed.
	sudo -u mysqlbridge bash -c '[ -f ~mysqlbridge/.ssh/id_rsa ] || ssh-keygen -t rsa -b 4096 -P "" -f ~mysqlbridge/.ssh/id_rsa'
	# Show it.
	sudo -u mysqlbridge cat ~mysqlbridge/.ssh/id_rsa.pub >&2

/home/mysqlbridge:
	# Create user.
	sudo adduser --home /home/mysqlbridge --gecos 'MySQL Bridge' --disabled-password mysqlbridge

stage-after-authorize: stage-verify-ssh stage-configure-autossh stage-get-mysql-backup

# This is a separate Make target because it is so side-effect-y that I
# want the admin to request it explicitly.
stage-start-secondary: stage-load-mysql-backup
	# OK, the scary part!
	echo "START SLAVE;" | mysql -uroot

stage-verify-ssh:
	# Verify that SSH access works. This is actually an
	# interactive process, since the user will have to say yes
	# that they accept the SSH key.
	sudo -u mysqlbridge ssh mysqlprimary echo success in logging in

stage-configure-autossh: /usr/share/doc/autossh /etc/systemd/multi-user.target.wants.autossh.service

/etc/systemd/multi-user.target.wants.autossh.service: /etc/systemd/system/autossh.service
	# Doing this creates the symlink.
	sudo systemctl enable autossh.service

	# Doing this actually starts the service, which is important, too.
	sudo systemctl start autossh.service

/etc/systemd/system/autossh.service: conf/autossh.service
	# Add an AutoSSH configuration so that, via a localhost port,
	# we have an encrypted/authenticated/etc. way to reach the MySQL
	# service on mysqlprimary.
	sudo cp conf/autossh.service /etc/systemd/system/autossh.service
	sudo chown root.root /etc/systemd/system/autossh.service
	sudo systemctl daemon-reload

stage-get-mysql-backup: /home/mysqlbridge/mysql-backup.sql

/home/mysqlbridge/mysql-backup.sql: /usr/share/doc/mysql-client
	# We would use sponge for atomic write, but since sponge keeps
	# going even if the mysqldump process aborts in the
	# middle... hmm well I guess this just isn't super robust if
	# the process aborts in the middle for now. (What if it exits
	# with a non-zero status code? What if the SSH tunnel breaks
	# in the middle of the MySQL dump?)
	mysqldump --host=127.0.0.1 --user=root --port=6446 --skip-lock-tables --single-transaction --flush-logs --hex-blob --master-data=1 -A  | sudo -u mysqlbridge sponge /home/mysqlbridge/mysql-backup.sql

stage-load-mysql-backup: /usr/share/doc/mysql-server /home/mysqlbridge/mysql-backup.sql.loaded

/home/mysqlbridge/mysql-backup.sql.loaded: /home/mysqlbridge/mysql-backup.sql
	# Have to make sure MySQL is started.
	sudo service mysql start

	# Tell MySQL where to find the primary database. We do this
	# now so that when we load the MySQL dump, the MySQL dump
	# tells the database what the MASTER_LOG_FILE and
	# MASTER_LOG_POS are. If we were to CHANGE MASTER to a new
	# host/port *after* doing the backup import, it would mean
	# that MySQL would throw away the MASTER_LOG_FILE &
	# MASTER_LOG_POS value.
	echo "CHANGE MASTER TO MASTER_HOST='127.0.0.1',MASTER_PORT=6446, MASTER_USER='replicator',MASTER_PASSWORD='replicator';" | mysql -uroot

	# Time to load that backup into ourselves, via "mysql -uroot".
	mysql -uroot < /home/mysqlbridge/mysql-backup.sql

	# If that worked OK, let's touch a stamp file.
	sudo -u mysqlbridge touch /home/mysqlbridge/mysql-backup.sql.loaded

### A tricky apt-get rule. The idea here is that other rules can
### depend on a package being installed on the system by depending on
### the filesystem-path of /usr/share/doc/$packagename.
###
### If we need to install it, then we install it.
/usr/share/doc/%:
	sudo DEBIAN_FRONTEND=noninteractive apt-get install --quiet=2 -y $(@F)

### Optional debugging tools.
debug-tools: /usr/share/doc/telnet

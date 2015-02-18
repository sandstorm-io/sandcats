all: dev-setup

dev-setup: /usr/local/bin/meteor /usr/share/doc/pdns-backend-mysql /usr/share/doc/mysql-server

/usr/local/bin/meteor:
	curl https://install.meteor.sh/ | sh

/usr/share/doc/pdns-backend-mysql:
	sudo apt-get install pdns-backend-mysql

/usr/share/doc/mysql-server:
	sudo apt-get install mysql-server

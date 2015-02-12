To actually run this software:

```
sudo apt-get install pdns-backend-mysql
echo "CREATE DATABASE sandcats_pdns;" | mysql -uroot
TMPFILE="$(mktemp /tmp/sandcats.XXXXXX)"
pwgen -s 16 > "$TMPFILE"
echo "CREATE USER sandcats_pdns IDENTIFIED BY '$(cat $TMPFILE)';" | mysql -uroot
echo "GRANT ALL on sandcats_pdns.* TO 'sandcats_pdns'@'localhost';" | mysql -uroot
```

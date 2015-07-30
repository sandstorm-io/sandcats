# -*- mode: ruby -*-
# vi: set ft=ruby :

# Vagrantfile API/syntax version. Don't touch unless you know what you're doing!
VAGRANTFILE_API_VERSION = "2"

Vagrant.configure(VAGRANTFILE_API_VERSION) do |config|
  # Base ourselves on a reasonable-seeming Debian base box. Jessie so
  # we can have systemd.
  config.vm.box = "debian/jessie64"

  # Avoid 'stdin is not a tty' pseudo-error.
  config.ssh.pty = true

  # This Vagrantfile creates two machines: the main machine, and a
  # secondary.
  #
  # The idea is to have the Vagrantfile effectively simulate bringing
  # up the production instances, where we need a main worker VM with
  # the web interface and also a secondary DNS server.
  config.vm.define "default", primary: true do |default|

    # Accessing "localhost:8443" will access port 443 on the guest
    # machine.
    default.vm.network "forwarded_port", guest: 443, host: 8443

    # Expose port 80 (HTTP) as 8080 (TCP) for the HTTP (non HTTPS)
    # view of the Meteor site.
    default.vm.network "forwarded_port", guest: 80, host: 8080,
                   protocol: 'tcp'

    # Expose port 8080 (UDP), for the meta-update protocol.
    default.vm.network "forwarded_port", guest: 8080, host: 8080,
                    protocol: 'udp'

    # Expose DNS in the guest as 8053 (UDP), for DNS queries.
    default.vm.network "forwarded_port", guest: 53, host: 8053,
                      protocol: 'udp'

    # Create a private host<->guest network, mostly for NFS.
    default.vm.network :private_network, ip: "169.254.253.2"
    default.vm.synced_folder ".", "/vagrant", type: "nfs"

    # Use a shell script that contains steps required to initialize a
    # sandcats server.
    default.vm.provision "shell", inline: "cd /vagrant && sudo apt-get --quiet=2 update && sudo -u vagrant make stage-provision"
  end

  # If you're developing on Sandcats itself, you won't need to think
  # about this "secondary" host. If you are hacking on config files
  # etc. for the secondary DNS box, you will want to "vagrant up
  # secondary" and "vagrant ssh secondary" to test it out.
  #
  # The way we configure it, at the moment, is via
  # `secondary/Makefile` in the repository.
  config.vm.define "secondary", primary: true do |secondary|
    # Give this thing an IP address by which it can reach the main
    # machine.
    secondary.vm.network :private_network, ip: "169.254.253.3"

    secondary.vm.provision "shell", inline: "cd /vagrant/secondary && sudo apt-get --quiet=2 update && sudo -u vagrant MYSQL_PRIMARY_IP_ADDRESS=169.254.253.2 make stage-before-authorize"
  end
end

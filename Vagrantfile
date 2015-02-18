# -*- mode: ruby -*-
# vi: set ft=ruby :

# Vagrantfile API/syntax version. Don't touch unless you know what you're doing!
VAGRANTFILE_API_VERSION = "2"

Vagrant.configure(VAGRANTFILE_API_VERSION) do |config|
  # Base ourselves on a reasonable-seeming Debian base box. Jessie so
  # we can have systemd.
  config.vm.box = "thoughtbot/debian-jessie-64"

  # Accessing "localhost:8443" will access port 443 on the guest
  # machine.
  config.vm.network "forwarded_port", guest: 443, host: 8443

  # Expose port 8080 (UDP), for the meta-update protocol.
  config.vm.network "forwarded_port", guest: 8080, host: 8080,
                    protocol: 'udp'

  # Expose DNS in the guest as 8053 (UDP), for DNS queries.
  config.vm.network "forwarded_port", guest: 53, host: 8053,
                    protocol: 'udp'

  # Create a private host<->guest network, mostly for NFS.
  config.vm.network :private_network, ip: "169.254.253.2"
  config.vm.synced_folder ".", "/vagrant", type: "nfs"

  # Use a shell script that contains steps required to initialize a
  # sandcats server.
  config.vm.provision "shell", inline: "cd /vagrant && sudo apt-get update && make provision"
end

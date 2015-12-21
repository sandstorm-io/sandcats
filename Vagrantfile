# -*- mode: ruby -*-
# vi: set ft=ruby :

# Vagrantfile API/syntax version. Don't touch unless you know what you're doing!
VAGRANTFILE_API_VERSION = "2"

Vagrant.configure(VAGRANTFILE_API_VERSION) do |config|
  # Base ourselves on a reasonable-seeming Debian base box. Jessie so
  # we can have systemd.
  config.vm.box = "sandstorm/debian-jessie64"

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

    # Port 8444 within the VM is used for manually testing HTTPS.
    default.vm.network "forwarded_port", guest: 8444, host: 8444

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

    default.vm.synced_folder ".", "/vagrant"

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

  ### Copied from sandstorm/Vagrantfile:
  # Calculate the number of CPUs and the amount of RAM the system has,
  # in a platform-dependent way; further logic below.
  cpus = nil
  total_kB_ram = nil

  host = RbConfig::CONFIG['host_os']
  if host =~ /darwin/
    cpus = `sysctl -n hw.ncpu`.to_i
    total_kB_ram =  `sysctl -n hw.memsize`.to_i / 1024
  elsif host =~ /linux/
    cpus = `nproc`.to_i
    total_kB_ram = `grep MemTotal /proc/meminfo | awk '{print $2}'`.to_i
  end

  # Use the same number of CPUs within Vagrant as the system, with 1
  # as a default.
  #
  # Use at least 512MB of RAM, and if the system has more than 2GB of
  # RAM, use 1/4 of the system RAM. This seems a reasonable compromise
  # between having the Vagrant guest operating system not run out of
  # RAM entirely (which it basically would if we went much lower than
  # 512MB) and also allowing it to use up a healthily large amount of
  # RAM so it can run faster on systems that can afford it.
  assign_cpus = nil
  assign_ram_mb = nil
  if cpus.nil?
    assign_cpus = 1
  else
    assign_cpus = cpus
  end
  if total_kB_ram.nil? or total_kB_ram < 2048000
    assign_ram_mb = 512
  else
    assign_ram_mb = (total_kB_ram / 1024 / 4)
  end

  # Actually provide the computed CPUs/memory to the backing provider.
  config.vm.provider :virtualbox do |vb|
    vb.cpus = assign_cpus
    vb.memory = assign_ram_mb
  end
  config.vm.provider :libvirt do |libvirt|
    libvirt.cpus = assign_cpus
    libvirt.memory = assign_ram_mb
  end
end

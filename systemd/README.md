# vcc-systemd

This is (or will be) a collection of unit files that allow the VCC services to be run in the correct dependency order on a normal distro using the [systemd](https://freedesktop.org/wiki/Software/systemd/) init system.

It will eventually replace the [init8js](https://github.com/joshiggins/init8js) init system that the container images are currently built with, and will make it easy to run the VCC outside of a container virtualisation platform and on a variety of distributions.
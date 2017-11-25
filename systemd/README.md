# vcc-systemd

This is a collection of unit files that allow the VCC services to be run in the correct dependency order using the [systemd](https://freedesktop.org/wiki/Software/systemd/) init system.

## Dependency order

(Green = After)

![systemd](https://user-images.githubusercontent.com/5124298/33227300-1093c976-d198-11e7-8ab9-b719c9279a58.png)

Units for the cluster services should be required by `vcc-services.target` so that they start

- after the dependencies in other containers have started (observed via discovery)
- before this container advertises that it's services are now running (for which another container may depend on)

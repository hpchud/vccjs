# vcc-systemd

This is a collection of unit files that allow the VCC services to be run in the correct dependency order using the [systemd](https://freedesktop.org/wiki/Software/systemd/) init system.

## Dependency order

(Green = After)

![systemd](https://user-images.githubusercontent.com/5124298/33227300-1093c976-d198-11e7-8ab9-b719c9279a58.png)

Units for the cluster services should be required by `vcc-services.target` so that they start

- after the dependencies in other containers have started (observed via discovery)
- before this container advertises that it's services are now running (for which another container may depend on)

## Multi service image

A single image can contain two service contexts, such as a headnode and workernode.

The tool will create a file `/etc/vcc/service-xxx` (where `xxx` is the service context) when starting the container.

In order to select units that are applicable to the current service context, use `ConditionPathExists=/etc/vcc/service-xxx` in the unit file.

A unit applicable to all service contexts offered by an image does not need to set anything.

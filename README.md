

# Overview

The VCC is a framework for building containers that encapsulate parallel applications.

It supports both *single node* and *multi node* execution, where a system of linked processes need to be executed on the same host or across different hosts respectively.

The orchestration of these processes is self-contained, offering a high degree of portability between container runtimes (Docker, Singularity, etc) and external orchestration middleware (PBS, Kubernetes, etc).

This allows fast setup and teardown of complex virtual environments to support different kinds of cluster and parallel applications, regardless of the underlying infrastructure.

The interactions between each component required to support the parallel application are modeled through a set of dependency linked services and related hooks that must be run when the providers of a service, or the number of hosts running the application, are changed.

# How do I use it?

This repository holds the Javascript implementation of the *Virtual Container Cluster*. The technical documentation is on the [Wiki pages](https://github.com/hpchud/vccjs/wiki).

A container image built using the VCC contains a large number of components. If you already have one, you can find out more about it by invoking the tool:

```
docker run -it --rm <IMAGE> --help
docker run -it --rm <IMAGE> --info
```

The general process for running any container built using the VCC is as follows:

1. Start the discovery container (if *multi node* execution is required)
2. Start the first container
3. Start subsequent containers on the same or other nodes

If you are just getting started, you probably want to do one of the following:

## Running one of the pre-built images

This is the recommended way to get started and to test the solution. Both these pre-built images require a *discovery* container to be running, as they support *multi node* execution.

Start the discovery service under Docker

```
docker run -d --name=discovery hpchud/vcc-discovery
```

### A Torque/PBS cluster

This image provides a full Torque/PBS cluster, with the MAUI scheduler, and demonstrates how to provision a cluster middleware in a VCC that can be dynamically scaled on top of an existing resource.

Start the head node for this system with the following command

```
docker run -d --name=headnode --link discovery:discovery \
    hpchud/vcc-torque \
    --cluster=test \
    --storage-host=discovery \
    --storage-port=2379 \
    --service=headnode
```

On the same machine, we can also provision a worker node to test the functionality.

```
docker run -d --name=workernode --link discovery:discovery \
    hpchud/vcc-torque \
    --cluster=test \
    --storage-host=discovery \
    --storage-port=2379 \
    --service=workernode
```

You can add as many workernodes as you like. If you expose the containers to the network, using `--net=host`, you may start the containers on different Docker hosts (in this case, use the real IP addresses instead of Docker `--link`s).

Now you can log in to the headnode and see that the cluster is running

```
docker exec -it headnode /bin/bash
```

```
pbsnodes
```

More information about this image can be found in the [hpchud/vcc-torque](https://github.com/hpchud/vcc-torque) repository.

## Using the `vcc` script

This script was designed to support an educational environment, and will provision a Torque/PBS cluster, with 1 head node and 1 worker node, using the Docker container runtime.

Download the script from the `v1.0` release:

```
wget -O /usr/local/bin/vcc https://github.com/hpchud/vccjs/releases/download/v1.0/vcc
```

```
chmod a+x /usr/local/bin/vcc
```

Run the update to make sure the Docker images are downloaded:

```
vcc update
```

Finally, provision the cluster:

```
vcc setuplab
```

You can enter the shell on the headnode either using `docker exec` or by typing

```
vcc shell
```

## Creating an image from scratch for your own application

See the wiki.

## Building or hacking on the code

This repository contains the VCC tool and service daemons. It is written in Node.js and shell scripts for the service hooks. 

For development, just pull in the dependencies using the Node Package Manager.

```
npm install
```

We would love to recieve pull requests and bug reports.

# License

The code in this repository is licensed under the MIT License. See the `LICENSE` file for the full text.

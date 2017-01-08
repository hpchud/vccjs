# vccjs

This repository holds the main Javascript implementation of the *Virtual Container Cluster*. 

## Overview

The VCC is a framework for creating Docker containers that encapsulate parallel cluster applications - in which multiple linked processes are executed on different hosts - such as in MPI.

The interactions between each component required to support the parallel application are modeled through a set of dependency linked *services* and related *hooks* that must be run when the providers of a service, or the number of hosts running the application, are changed.

See the `vcc-torque` and the `vcc-hadoop` repositories for the sample applications.

The paper describing the architecture and benchmarking of the system is published in *The Computer Journal*. The author's self-archived copy is contained within this repository.

## Building

This repository is used to build the base image that contains the VCC tool, daemons and the service manager entrypoint. Two Dockerfiles are provided to build this image based on CentOS or Ubuntu, but it should be really easy to create one for your preferred distro based on these.

```
docker build -f Dockerfile.centos -t vcccentos .
```
```
docker build -f Dockerfile.ubuntu -t vccubuntu .
```

## Contributing

We would love to recieve pull requests and bug reports.
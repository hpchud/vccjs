---
title: 'VCC: A framework for building containerized reproducible cluster software environments'
tags:
  - containers
  - HPC
  - reproducibility
  - virtualisation
  - cluster
authors:
 - name: Joshua Higgins
   orcid: 0000-0003-1551-5552
   affiliation: 1
 - name: Violeta Holmes
   orcid: 0000-0002-9786-4555
   affiliation: 1
 - name: Colin Venters
   affiliation: 1
affiliations:
 - name: High Performance Computing Research Group, University of Huddersfield
   index: 1
date: 6 March 2017
bibliography: paper.bib
---

# Summary

The problem of portability and reproducibility of the software used to conduct computational experiments has recently come to the fore. Container virtualisation has proved to be a powerful tool to achieve portability of a code and it's execution environment, through runtimes such as Docker, LXC, Singularity and others.

However, scientific software often depends on a system foundation that provides middleware, libraries, and other supporting software in order for the code to execute as intended. Typically, container virtualisation addresses only the portability of the code itself, which does not make it inherently reproducible. For example, a containerized MPI application may offer binary compatibility between different systems, but for execution _as intended_, it must be run on an existing cluster that provides the correct interfaces for parallel MPI execution.

As a greater demand to accomodate a diverse range of disciplines is placed on high performance and cluster resources, the ability to quicky create and teardown reproducible, transitory virtual environments that are tailored for an individual task or experiment will be essential.

The Virtual Container Cluster (VCC) is a framework for building containers that achieve this goal, by encapsulating a parallel application along with an execution model, through a set of dependency linked services and built-in process orchestration. This promotes a high degree of portability, and offers easier reproducibility by shipping the application along with everything required to execute it - whether that be an MPI cluster, big data processing framework, bioinformatics pipeline, or any other execution model.

# References

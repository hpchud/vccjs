vcc




1. load in our configuration
	- this tell us where to find the key value store

2. connect to the key value store

3. wait for dependent services to be registered in kv store (value is hostname of that service)

4. start cluster dns service (may be required in hooks)

5. run service hooks for the services we depend on

6. run the system targets (replacing init system)

7. add ourselves to the cluster hosts in the kv store

8. start watching for changes in cluster hosts
	- on change detected, run cluster hooks

9. advertise that any services we provide are ready, when we reach ready target
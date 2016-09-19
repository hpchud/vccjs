#!/bin/bash

# service hook for torque server
# $1 is set to the value of the service key, in this case, will be the torque server
# the hooks can be customised in different images to perform different tasks

echo $1 > /var/spool/torque/server_name

# configure the mom if we have it

echo "\$pbsserver $1" > /var/spool/torque/mom_priv/config
echo "\$logevent 255" >> /var/spool/torque/mom_priv/config
echo "\$mom_host vnode_`hostname`" >> /var/spool/torque/mom_priv/config

# the first run of this hook should be before services start
# for a context update, we should handle restarting service somehow
